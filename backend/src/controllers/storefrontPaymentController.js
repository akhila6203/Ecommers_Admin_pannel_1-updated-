const crypto = require("crypto");
const Razorpay = require("razorpay");
const { query, getConnection } = require("../config/db");
const { generateOrderNumber } = require("../helpers/generateHelper");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const { cartWhereClause, resolveCartScope } = require("../helpers/cartHelper");
const { recordCouponUsage } = require("./couponController");
const logger = require("../config/logger");
const {
  calculateStoreShippingCharge,
} = require("../helpers/shippingHelper");
const {
  roundMoney,
  calculateInclusiveGst,
} = require("../helpers/gstHelper");
const {
  sendOrderConfirmationWhatsApp,
} = require("../helpers/whatsappHelper");



const getRazorpayConfig = async (storeId) => {
  const rows = await query(
    `SELECT razorpay_enabled, razorpay_key_id, razorpay_key_secret
     FROM integration_settings
     WHERE store_id = ?
     LIMIT 1`,
    [storeId]
  );

  if (!rows.length || Number(rows[0].razorpay_enabled) !== 1) {
    throw new Error("Razorpay integration is disabled");
  }

  if (!rows[0].razorpay_key_id || !rows[0].razorpay_key_secret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return {
    keyId: rows[0].razorpay_key_id,
    keySecret: rows[0].razorpay_key_secret,
  };
};

const getRazorpayClient = async (storeId) => {
  const config = await getRazorpayConfig(storeId);

  return {
    client: new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    }),
    keyId: config.keyId,
    keySecret: config.keySecret,
  };
};
// const getRazorpayClient = () => {
//   const keyId = process.env.RAZORPAY_KEY_ID;
//   const keySecret = process.env.RAZORPAY_KEY_SECRET;
//   if (!keyId || !keySecret) {
//     throw new Error("Razorpay credentials are not configured");
//   }
//   return new Razorpay({ key_id: keyId, key_secret: keySecret });
// };

const calculateDiscount = (coupon, orderAmount) => {
  const amount = parseFloat(orderAmount) || 0;
  if (amount <= 0) return 0;
  let discount =
    coupon.type === "percentage" ? (amount * parseFloat(coupon.value)) / 100 : parseFloat(coupon.value);
  if (coupon.maximum_discount && parseFloat(coupon.maximum_discount) > 0) {
    discount = Math.min(discount, parseFloat(coupon.maximum_discount));
  }
  return Math.round(discount * 100) / 100;
};

// const calculateShippingCharge = (subtotal) => (subtotal > 999 || subtotal === 0 ? 0 : 99);

const fetchCartItemsForCheckout = async (scope) => {
  const where = cartWhereClause(scope, "c");
  if (!where) return [];

  return query(
    `SELECT
      c.id AS cart_id,
      c.product_id,
      c.variant_id,
      c.quantity,
      c.selected_size,
      c.selected_color,
      c.item_price,
      c.item_data,
      p.name,
      p.sku,
      p.price,
      p.offer_price,
      p.thumbnail,
      p.stock,
      p.gst_percent,
      pv.size AS variant_size,
      pv.color AS variant_color,
      pv.price AS variant_price,
      pv.offer_price AS variant_offer_price,
      pv.stock AS variant_stock,
pv.image AS variant_image,
p.slug AS product_slug,
(SELECT pvi.image
 FROM product_variant_images pvi
 WHERE pvi.variant_id = c.variant_id
   AND pvi.product_id = c.product_id
   AND pvi.store_id = c.store_id
 ORDER BY pvi.sort_order ASC, pvi.id ASC
 LIMIT 1) AS variant_first_image
     FROM cart c
     INNER JOIN products p ON p.id = c.product_id AND p.store_id = c.store_id
     LEFT JOIN product_variants pv ON pv.id = c.variant_id AND pv.store_id = c.store_id
     WHERE ${where.clause}
     ORDER BY c.updated_at DESC`,
    where.params
  );
};

const buildVariantInfo = (item) => {
  const variantInfo = {};
  if (item.selected_size || item.variant_size) {
    variantInfo.selected_size = item.selected_size || item.variant_size;
  }


  if (item.selected_color || item.variant_color) {
    variantInfo.selected_color = item.selected_color || item.variant_color;
  }

  if (item.item_data) {
    try {
      const data = typeof item.item_data === "string" ? JSON.parse(item.item_data) : item.item_data;
      if (data?.fabric) variantInfo.fabric = data.fabric;
      if (data?.material) variantInfo.material = data.material;
      if (!variantInfo.selected_size && data?.selected_size) variantInfo.selected_size = data.selected_size;
      if (!variantInfo.selected_color && data?.selected_color) variantInfo.selected_color = data.selected_color;
    } catch {
      // ignore invalid item_data
    }
  }

  return Object.keys(variantInfo).length ? variantInfo : null;
};

const prepareCheckoutTotals = async (req, connection) => {
  const storeId = getStoreId(req);
  const customerId = req.customer.id;
  const scope = resolveCartScope(req);
  if (!scope.customerId) {
    scope.customerId = customerId;
  }

  const cartItems = await fetchCartItemsForCheckout(scope);
  if (!cartItems.length) {
    return { error: "Your cart is empty" };
  }

  const {
    coupon_id,
    coupon_code,
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_pincode,
  } = req.body;

  if (!shipping_name || !shipping_phone || !shipping_address || !shipping_city || !shipping_state || !shipping_pincode) {
    return { error: "Complete shipping address is required" };
  }

  const customers = await query(
    "SELECT id, email, phone, first_name, last_name FROM customers WHERE id = ? AND store_id = ? AND status = 'active'",
    [customerId, storeId]
  );
  if (!customers.length) {
    return { error: "Customer account not found or inactive" };
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of cartItems) {
    const unitPrice = Number(
      item.item_price || item.variant_offer_price || item.variant_price || item.offer_price || item.price || 0
    );
    const availableStock = item.variant_id ? Number(item.variant_stock ?? item.stock) : Number(item.stock);
    const qty = Number(item.quantity);

    if (availableStock < qty) {
      return { error: `Insufficient stock for ${item.name}` };
    }

    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    let itemData = {};
try {
  itemData =
    typeof item.item_data === "string"
      ? JSON.parse(item.item_data || "{}")
      : item.item_data || {};
} catch {
  itemData = {};
}

const selectedImage =
  itemData.image ||
  item.variant_first_image ||
  item.variant_image ||
  item.thumbnail ||
  "";

    orderItems.push({
      product_id: item.product_id,
      product_name: item.name,
      sku: item.sku,
      variant_id: item.variant_id,
      variant_info: buildVariantInfo(item),
      quantity: qty,
      price: unitPrice,
      offer_price: unitPrice,
      total_price: lineTotal,
      gst_percent: Number(item.gst_percent || 0),
      gst_amount: 0,
      image: selectedImage,
      // image: item.thumbnail,
      cart_id: item.cart_id,
    });
  }

  let discountAmount = 0;
  let appliedCouponCode = null;
  let appliedCouponId = null;

  const couponLookupCode = coupon_code?.trim();
  if (couponLookupCode || coupon_id) {
    let couponQuery = `SELECT id, code, type, value, minimum_order_amount, maximum_discount, usage_limit, used_count, status
       FROM coupons
       WHERE store_id = ? AND status = 'active'
         AND (expiry_date IS NULL OR expiry_date >= CURDATE())
         AND (start_date IS NULL OR start_date <= CURDATE())`;
    const couponParams = [storeId];

    if (coupon_id) {
      couponQuery += " AND id = ?";
      couponParams.push(coupon_id);
    } else {
      couponQuery += " AND code = ?";
      couponParams.push(couponLookupCode.toUpperCase());
    }

    const [coupons] = await connection.query(couponQuery, couponParams);
    if (!coupons.length) {
      return { error: "Invalid or expired coupon" };
    }

    const coupon = coupons[0];
    if (coupon.minimum_order_amount && subtotal < parseFloat(coupon.minimum_order_amount)) {
      return { error: `Minimum order amount is ₹${coupon.minimum_order_amount}` };
    }
    if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
      return { error: "Coupon usage limit reached" };
    }

    discountAmount = calculateDiscount(coupon, subtotal);
    appliedCouponCode = coupon.code;
    appliedCouponId = coupon.id;
  }

    /*
 * GST-inclusive breakdown.
 *
 * Coupon apply kakapothe discountAmount = 0.
 * Coupon apply ayithe discount proportionally
 * each product meedha distribute avuthundi.
 *
 * gst_percent = 0 means Charge Tax OFF.
 */
let gstAmount = 0;

const discountedProductsTotal = Math.max(
  0,
  subtotal - discountAmount
);

const discountRatio =
  subtotal > 0
    ? discountedProductsTotal / subtotal
    : 1;

for (const orderItem of orderItems) {
  const gstPercent = Number(
    orderItem.gst_percent || 0
  );

  if (gstPercent <= 0) {
    orderItem.gst_amount = 0;
    continue;
  }

  const discountedLineTotal = roundMoney(
    Number(orderItem.total_price || 0) *
      discountRatio
  );

  const gstBreakdown =
    calculateInclusiveGst(
      discountedLineTotal,
      gstPercent
    );

  orderItem.gst_amount =
    gstBreakdown.gstAmount;

  gstAmount = roundMoney(
    gstAmount +
      gstBreakdown.gstAmount
  );
}
  // const shippingCharge = calculateShippingCharge(subtotal);
  // const taxAmount = 0;
  // const gstAmount = 0;
  // const totalAmount = Math.max(0, subtotal - discountAmount + shippingCharge + taxAmount);
  const shippingResult =
    await calculateStoreShippingCharge({
      storeId,
      subtotal,
    });
    const shippingCharge =
  shippingResult.shippingCharge;

const taxAmount = 0;

/*
 * GST already product selling price lo included.
 * Therefore gstAmount ni total ki add cheyyakudadhu.
 */
const totalAmount = Math.max(
  0,
  subtotal -
    discountAmount +
    shippingCharge
);
  // const shippingCharge = shippingResult.shippingCharge;
  // const taxAmount = 0;
  // const gstAmount = 0;
  // const totalAmount = Math.max(
  //   0,
  //   subtotal -
  //     discountAmount +
  //     shippingCharge +
  //     taxAmount
  // );


  return {
    storeId,
    customerId,
    scope,
    customer: customers[0],
    orderItems,
    subtotal,
    discountAmount,
    appliedCouponCode,
    appliedCouponId,

    shippingCharge,
  shippingSettings:
    shippingResult.settings,
  isFreeShipping:
    shippingResult.isFreeShipping,

    taxAmount,
    gstAmount,
    totalAmount,
  };
};

const createPayment = async (req, res) => {
  const connection = await getConnection();
  try {
    const checkout = await prepareCheckoutTotals(req, connection);
    if (checkout.error) {
      return errorResponse(res, checkout.error, 400);
    }

    const { totalAmount } = checkout;
    if (totalAmount <= 0) {
      return errorResponse(res, "Invalid order total", 400);
    }

    const { client: razorpay, keyId } = await getRazorpayClient(checkout.storeId);
    // const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: req.body.currency || "INR",
      receipt: `rcpt_${Date.now()}_${req.customer.id}`,
      notes: {
        store_id: String(checkout.storeId),
        customer_id: String(checkout.customerId),
      },
    });

    // return successResponse(res, {
    //   razorpay_order_id: razorpayOrder.id,
    //   amount: razorpayOrder.amount,
    //   currency: razorpayOrder.currency,
    //   key_id: keyId,
    //   // key_id: process.env.RAZORPAY_KEY_ID,
    // });
    return successResponse(res, {
      razorpay_order_id:
        razorpayOrder.id,

      amount:
        razorpayOrder.amount,

      currency:
        razorpayOrder.currency,

      key_id:
        keyId,

      summary: {
        subtotal:
          checkout.subtotal,

        discount_amount:
          checkout.discountAmount,

        gst_amount:
          checkout.gstAmount,

        shipping_charge:
          checkout.shippingCharge,

        total_amount:
          checkout.totalAmount,
      },
    });
  } catch (error) {
    logger.error("Create payment error:", error);
    return errorResponse(
      res,
      error.message || "Failed to create payment order",
      error.message?.includes("Razorpay credentials") ? 503 : 500
    );
  } finally {
    connection.release();
  }
};

const createPaidOrder = async (connection, req, checkout, paymentDetails) => {
  const {
    storeId,
    customerId,
    scope,
    customer,
    orderItems,
    subtotal,
    discountAmount,
    appliedCouponCode,
    appliedCouponId,
    shippingCharge,
    taxAmount,
    gstAmount,
    totalAmount,
  } = checkout;

  const {
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_pincode,
    shipping_country,
    billing_name,
    billing_phone,
    billing_address,
    billing_city,
    billing_state,
    billing_pincode,
    billing_country,
  } = req.body;

  const orderNumber = generateOrderNumber();

  const [orderResult] = await connection.query(
    `INSERT INTO orders
      (store_id, order_number, customer_id, email, phone,
       shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, shipping_country,
       billing_name, billing_phone, billing_address, billing_city, billing_state, billing_pincode, billing_country,
       subtotal, discount_amount, coupon_id, coupon_code, shipping_charge, tax_amount, gst_amount, total_amount,
       paid_amount, due_amount, payment_method, payment_status, payment_id, payment_gateway, payment_reference,
       order_status, is_paid, is_cod)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      storeId,
      orderNumber,
      customerId,
      customer.email,
      customer.phone || shipping_phone,
      shipping_name,
      shipping_phone,
      shipping_address,
      shipping_city,
      shipping_state,
      shipping_pincode,
      shipping_country || "India",
      billing_name || shipping_name,
      billing_phone || shipping_phone,
      billing_address || shipping_address,
      billing_city || shipping_city,
      billing_state || shipping_state,
      billing_pincode || shipping_pincode,
      billing_country || shipping_country || "India",
      subtotal,
      discountAmount,
      appliedCouponId,
      appliedCouponCode,
      shippingCharge,
      taxAmount,
      gstAmount,
      totalAmount,
      totalAmount,
      0,
      "online",
      "paid",
      paymentDetails.razorpay_payment_id,
      "razorpay",
      paymentDetails.razorpay_order_id,
      "confirmed",
      1,
      0,
    ]
  );

  const orderId = orderResult.insertId;

  for (const item of orderItems) {
    await connection.query(
      `INSERT INTO order_items
        (store_id, order_id, product_id, product_name, product_sku, variant_id, variant_info,
         quantity, price, offer_price, total_price, gst_percent, gst_amount, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        orderId,
        item.product_id,
        item.product_name,
        item.sku,
        item.variant_id,
        item.variant_info ? JSON.stringify(item.variant_info) : null,
        item.quantity,
        item.price,
        item.offer_price,
        item.total_price,
        item.gst_percent,
        item.gst_amount,
        item.image,
      ]
    );

    await connection.query(
      "UPDATE products SET stock = stock - ? WHERE id = ? AND store_id = ?",
      [item.quantity, item.product_id, storeId]
    );
    try {
      await connection.query(
        "UPDATE inventory SET quantity = quantity - ?, available_quantity = available_quantity - ? WHERE product_id = ? AND store_id = ?",
        [item.quantity, item.quantity, item.product_id, storeId]
      );
    } catch (inventoryError) {
      logger.warn("Inventory update skipped:", inventoryError.message);
    }
    if (item.variant_id) {
      await connection.query(
        "UPDATE product_variants SET stock = GREATEST(stock - ?, 0) WHERE id = ? AND store_id = ?",
        [item.quantity, item.variant_id, storeId]
      );
    }
    try {
      await connection.query(
        "INSERT INTO inventory_logs (store_id, product_id, type, quantity, reference_type, reference_id, notes) VALUES (?, ?, 'sale', ?, 'order', ?, ?)",
        [storeId, item.product_id, -item.quantity, orderId, `Order #${orderNumber}`]
      );
    } catch (logError) {
      logger.warn("Inventory log skipped:", logError.message);
    }
  }

  await connection.query(
    "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'paid', 'Payment completed successfully', NULL)",
    [storeId, orderId]
  );
  await connection.query(
    "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'confirmed', 'Order confirmed', NULL)",
    [storeId, orderId]
  );

  await connection.query(
    `INSERT INTO order_notes (store_id, order_id, note, note_type, is_visible_to_customer)
     VALUES (?, ?, 'Customer placed online paid order', 'system', 1)`,
    [storeId, orderId]
  );

  if (appliedCouponCode) {
    await recordCouponUsage(connection, {
      couponCode: appliedCouponCode,
      customerId,
      orderId,
      discountAmount,
      storeId,
    });
  }

  const cartWhere = cartWhereClause(scope);
  await connection.query(`DELETE FROM cart WHERE ${cartWhere.clause}`, cartWhere.params);

  await connection.query(
    "UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ? AND store_id = ?",
    [totalAmount, customerId, storeId]
  );

  const [orders] = await connection.query(
  "SELECT * FROM orders WHERE id = ? AND store_id = ?",
  [orderId, storeId]
);

const [savedItems] = await connection.query(
  "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
  [orderId, storeId]
);

if (!orders.length) {
  throw new Error("Order created but not found before commit");
}

return { order: orders[0], items: savedItems };
  // const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
  // const savedItems = await query(
  //   "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
  //   [orderId, storeId]
  // );

  // return { order: orders[0], items: savedItems };
};

const verifyPayment = async (req, res) => {
  const connection = await getConnection();
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return errorResponse(res, "Payment verification details are required", 400);
    }

    const storeId = getStoreId(req);
    const { keySecret } = await getRazorpayClient(storeId);
    // const keySecret = process.env.RAZORPAY_KEY_SECRET;
    // if (!keySecret) {
    //   return errorResponse(res, "Payment gateway is not configured", 503);
    // }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return errorResponse(res, "Invalid payment signature", 400);
    }

    /*
 * Duplicate order check.
 * Same Razorpay payment ID tho already order create ayithe
 * malli create avvakudadhu.
 */
const existingOrders = await query(
  `SELECT id, order_number
   FROM orders
   WHERE store_id = ?
     AND payment_id = ?
   LIMIT 1`,
  [storeId, razorpay_payment_id]
);

if (existingOrders.length) {
  return errorResponse(
    res,
    "Order already created for this payment",
    409
  );
}

/*
 * Backend recomputes subtotal, coupon,
 * shipping and final total.
 */
const checkout =
  await prepareCheckoutTotals(
    req,
    connection
  );

if (checkout.error) {
  return errorResponse(
    res,
    checkout.error,
    400
  );
}

/*
 * Fetch Razorpay order and payment
 * directly from Razorpay server.
 */
const {
  client: razorpay,
} = await getRazorpayClient(storeId);

const razorpayOrder =
  await razorpay.orders.fetch(
    razorpay_order_id
  );

if (!razorpayOrder) {
  return errorResponse(
    res,
    "Razorpay order not found",
    400
  );
}

const expectedAmountInPaise =
  Math.round(
    Number(checkout.totalAmount) * 100
  );

const razorpayOrderAmountInPaise =
  Number(razorpayOrder.amount || 0);

if (
  razorpayOrderAmountInPaise !==
  expectedAmountInPaise
) {
  logger.error(
    "Payment amount mismatch",
    {
      storeId,
      razorpayOrderId:
        razorpay_order_id,
      razorpayAmount:
        razorpayOrderAmountInPaise,
      backendAmount:
        expectedAmountInPaise,
    }
  );

  return errorResponse(
    res,
    "Order amount changed during payment. Please contact support.",
    409
  );
}

const razorpayPayment =
  await razorpay.payments.fetch(
    razorpay_payment_id
  );

if (
  !razorpayPayment ||
  razorpayPayment.order_id !==
    razorpay_order_id
) {
  return errorResponse(
    res,
    "Payment does not belong to this order",
    400
  );
}

if (
  !["authorized", "captured"].includes(
    razorpayPayment.status
  )
) {
  return errorResponse(
    res,
    "Payment is not completed",
    400
  );
}

if (
  Number(razorpayPayment.amount || 0) !==
  razorpayOrderAmountInPaise
) {
  return errorResponse(
    res,
    "Paid amount does not match order amount",
    400
  );
}

    // const checkout = await prepareCheckoutTotals(req, connection);
    // if (checkout.error) {
    //   return errorResponse(res, checkout.error, 400);
    // }

    await connection.beginTransaction();

    const result = await createPaidOrder(connection, req, checkout, {
      razorpay_payment_id,
      razorpay_order_id,
    });

    await connection.commit();

    const savedOrder = result.order;

    /*
 * WhatsApp ni background lo start chesthunnam.
 *
 * await use cheyyatam ledu kabatti:
 * 1. Frontend success response fast ga velthundi.
 * 2. Order Success screen immediately open avuthundi.
 * 3. WhatsApp message shortly after vasthundi.
 * 4. WhatsApp fail ayina order/payment fail avvavu.
 */
sendOrderConfirmationWhatsApp({
  storeId,
  order: savedOrder,
  items: result.items || [],
})
  .then(() => {
    logger.info(
      "Order confirmation WhatsApp sent",
      {
        storeId,
        orderId: savedOrder.id,
        orderNumber:
          savedOrder.order_number,
      }
    );
  })
  .catch((whatsappError) => {
    logger.error(
      "Order completed but WhatsApp confirmation failed",
      {
        storeId,
        orderId: savedOrder.id,
        orderNumber:
          savedOrder.order_number,
        message: whatsappError.message,
      }
    );
  });

    return successResponse(
      res,
      {
        order: {
          id: savedOrder.id,
          order_number: savedOrder.order_number,
          total_amount: savedOrder.total_amount,
          subtotal: savedOrder.subtotal,
          discount_amount: savedOrder.discount_amount,
          shipping_charge: savedOrder.shipping_charge,
          tax_amount: savedOrder.tax_amount,

          gst_amount: savedOrder.gst_amount,
          
          payment_method: savedOrder.payment_method,
          payment_status: savedOrder.payment_status,
          order_status: savedOrder.order_status,
          shipping_name: savedOrder.shipping_name,
          shipping_phone: savedOrder.shipping_phone,
          shipping_address: savedOrder.shipping_address,
          shipping_city: savedOrder.shipping_city,
          shipping_state: savedOrder.shipping_state,
          shipping_pincode: savedOrder.shipping_pincode,
          shipping_country: savedOrder.shipping_country,
          created_at: savedOrder.created_at,
        },
        items: result.items,
      },
      "Payment verified and order placed successfully",
      201
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    logger.error("Verify payment error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to verify payment",
      500
    );
  } finally {
    connection.release();
  }
};

module.exports.createPayment = createPayment;
module.exports.verifyPayment = verifyPayment;




// const crypto = require("crypto");
// const Razorpay = require("razorpay");
// const { query, getConnection } = require("../config/db");
// const { generateOrderNumber } = require("../helpers/generateHelper");
// const { successResponse, errorResponse } = require("../helpers/responseHelper");
// const { getStoreId } = require("../helpers/storeHelper");
// const { cartWhereClause, resolveCartScope } = require("../helpers/cartHelper");
// const { recordCouponUsage } = require("./couponController");
// const logger = require("../config/logger");
// const getRazorpayConfig = async (storeId) => {
//   const rows = await query(
//     `SELECT razorpay_enabled, razorpay_key_id, razorpay_key_secret
//      FROM integration_settings
//      WHERE store_id = ?
//      LIMIT 1`,
//     [storeId]
//   );

//   if (!rows.length || Number(rows[0].razorpay_enabled) !== 1) {
//     throw new Error("Razorpay integration is disabled");
//   }

//   if (!rows[0].razorpay_key_id || !rows[0].razorpay_key_secret) {
//     throw new Error("Razorpay credentials are not configured");
//   }

//   return {
//     keyId: rows[0].razorpay_key_id,
//     keySecret: rows[0].razorpay_key_secret,
//   };
// };

// const getRazorpayClient = async (storeId) => {
//   const config = await getRazorpayConfig(storeId);

//   return {
//     client: new Razorpay({
//       key_id: config.keyId,
//       key_secret: config.keySecret,
//     }),
//     keyId: config.keyId,
//     keySecret: config.keySecret,
//   };
// };
// // const getRazorpayClient = () => {
// //   const keyId = process.env.RAZORPAY_KEY_ID;
// //   const keySecret = process.env.RAZORPAY_KEY_SECRET;
// //   if (!keyId || !keySecret) {
// //     throw new Error("Razorpay credentials are not configured");
// //   }
// //   return new Razorpay({ key_id: keyId, key_secret: keySecret });
// // };

// const calculateDiscount = (coupon, orderAmount) => {
//   const amount = parseFloat(orderAmount) || 0;
//   if (amount <= 0) return 0;
//   let discount =
//     coupon.type === "percentage" ? (amount * parseFloat(coupon.value)) / 100 : parseFloat(coupon.value);
//   if (coupon.maximum_discount && parseFloat(coupon.maximum_discount) > 0) {
//     discount = Math.min(discount, parseFloat(coupon.maximum_discount));
//   }
//   return Math.round(discount * 100) / 100;
// };

// const calculateShippingCharge = (subtotal) => (subtotal > 999 || subtotal === 0 ? 0 : 99);

// const fetchCartItemsForCheckout = async (scope) => {
//   const where = cartWhereClause(scope, "c");
//   if (!where) return [];

//   return query(
//     `SELECT
//       c.id AS cart_id,
//       c.product_id,
//       c.variant_id,
//       c.quantity,
//       c.selected_size,
//       c.selected_color,
//       c.item_price,
//       c.item_data,
//       p.name,
//       p.sku,
//       p.price,
//       p.offer_price,
//       p.thumbnail,
//       p.stock,
//       p.gst_percent,
//       pv.size AS variant_size,
//       pv.color AS variant_color,
//       pv.price AS variant_price,
//       pv.offer_price AS variant_offer_price,
//       pv.stock AS variant_stock,
// pv.image AS variant_image,
// p.slug AS product_slug,
// (SELECT pvi.image
//  FROM product_variant_images pvi
//  WHERE pvi.variant_id = c.variant_id
//    AND pvi.product_id = c.product_id
//    AND pvi.store_id = c.store_id
//  ORDER BY pvi.sort_order ASC, pvi.id ASC
//  LIMIT 1) AS variant_first_image
//      FROM cart c
//      INNER JOIN products p ON p.id = c.product_id AND p.store_id = c.store_id
//      LEFT JOIN product_variants pv ON pv.id = c.variant_id AND pv.store_id = c.store_id
//      WHERE ${where.clause}
//      ORDER BY c.updated_at DESC`,
//     where.params
//   );
// };

// const buildVariantInfo = (item) => {
//   const variantInfo = {};
//   if (item.selected_size || item.variant_size) {
//     variantInfo.selected_size = item.selected_size || item.variant_size;
//   }


//   if (item.selected_color || item.variant_color) {
//     variantInfo.selected_color = item.selected_color || item.variant_color;
//   }

//   if (item.item_data) {
//     try {
//       const data = typeof item.item_data === "string" ? JSON.parse(item.item_data) : item.item_data;
//       if (data?.fabric) variantInfo.fabric = data.fabric;
//       if (data?.material) variantInfo.material = data.material;
//       if (!variantInfo.selected_size && data?.selected_size) variantInfo.selected_size = data.selected_size;
//       if (!variantInfo.selected_color && data?.selected_color) variantInfo.selected_color = data.selected_color;
//     } catch {
//       // ignore invalid item_data
//     }
//   }

//   return Object.keys(variantInfo).length ? variantInfo : null;
// };

// const prepareCheckoutTotals = async (req, connection) => {
//   const storeId = getStoreId(req);
//   const customerId = req.customer.id;
//   const scope = resolveCartScope(req);
//   if (!scope.customerId) {
//     scope.customerId = customerId;
//   }

//   const cartItems = await fetchCartItemsForCheckout(scope);
//   if (!cartItems.length) {
//     return { error: "Your cart is empty" };
//   }

//   const {
//     coupon_id,
//     coupon_code,
//     shipping_name,
//     shipping_phone,
//     shipping_address,
//     shipping_city,
//     shipping_state,
//     shipping_pincode,
//   } = req.body;

//   if (!shipping_name || !shipping_phone || !shipping_address || !shipping_city || !shipping_state || !shipping_pincode) {
//     return { error: "Complete shipping address is required" };
//   }

//   const customers = await query(
//     "SELECT id, email, phone, first_name, last_name FROM customers WHERE id = ? AND store_id = ? AND status = 'active'",
//     [customerId, storeId]
//   );
//   if (!customers.length) {
//     return { error: "Customer account not found or inactive" };
//   }

//   let subtotal = 0;
//   const orderItems = [];

//   for (const item of cartItems) {
//     const unitPrice = Number(
//       item.item_price || item.variant_offer_price || item.variant_price || item.offer_price || item.price || 0
//     );
//     const availableStock = item.variant_id ? Number(item.variant_stock ?? item.stock) : Number(item.stock);
//     const qty = Number(item.quantity);

//     if (availableStock < qty) {
//       return { error: `Insufficient stock for ${item.name}` };
//     }

//     const lineTotal = unitPrice * qty;
//     subtotal += lineTotal;

//     let itemData = {};
// try {
//   itemData =
//     typeof item.item_data === "string"
//       ? JSON.parse(item.item_data || "{}")
//       : item.item_data || {};
// } catch {
//   itemData = {};
// }

// const selectedImage =
//   itemData.image ||
//   item.variant_first_image ||
//   item.variant_image ||
//   item.thumbnail ||
//   "";

//     orderItems.push({
//       product_id: item.product_id,
//       product_name: item.name,
//       sku: item.sku,
//       variant_id: item.variant_id,
//       variant_info: buildVariantInfo(item),
//       quantity: qty,
//       price: unitPrice,
//       offer_price: unitPrice,
//       total_price: lineTotal,
//       gst_percent: Number(item.gst_percent || 0),
//       gst_amount: 0,
//       image: selectedImage,
//       // image: item.thumbnail,
//       cart_id: item.cart_id,
//     });
//   }

//   let discountAmount = 0;
//   let appliedCouponCode = null;
//   let appliedCouponId = null;

//   const couponLookupCode = coupon_code?.trim();
//   if (couponLookupCode || coupon_id) {
//     let couponQuery = `SELECT id, code, type, value, minimum_order_amount, maximum_discount, usage_limit, used_count, status
//        FROM coupons
//        WHERE store_id = ? AND status = 'active'
//          AND (expiry_date IS NULL OR expiry_date >= CURDATE())
//          AND (start_date IS NULL OR start_date <= CURDATE())`;
//     const couponParams = [storeId];

//     if (coupon_id) {
//       couponQuery += " AND id = ?";
//       couponParams.push(coupon_id);
//     } else {
//       couponQuery += " AND code = ?";
//       couponParams.push(couponLookupCode.toUpperCase());
//     }

//     const [coupons] = await connection.query(couponQuery, couponParams);
//     if (!coupons.length) {
//       return { error: "Invalid or expired coupon" };
//     }

//     const coupon = coupons[0];
//     if (coupon.minimum_order_amount && subtotal < parseFloat(coupon.minimum_order_amount)) {
//       return { error: `Minimum order amount is ₹${coupon.minimum_order_amount}` };
//     }
//     if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
//       return { error: "Coupon usage limit reached" };
//     }

//     discountAmount = calculateDiscount(coupon, subtotal);
//     appliedCouponCode = coupon.code;
//     appliedCouponId = coupon.id;
//   }

//   const shippingCharge = calculateShippingCharge(subtotal);
//   const taxAmount = 0;
//   const gstAmount = 0;
//   const totalAmount = Math.max(0, subtotal - discountAmount + shippingCharge + taxAmount);

//   return {
//     storeId,
//     customerId,
//     scope,
//     customer: customers[0],
//     orderItems,
//     subtotal,
//     discountAmount,
//     appliedCouponCode,
//     appliedCouponId,
//     shippingCharge,
//     taxAmount,
//     gstAmount,
//     totalAmount,
//   };
// };

// const createPayment = async (req, res) => {
//   const connection = await getConnection();
//   try {
//     const checkout = await prepareCheckoutTotals(req, connection);
//     if (checkout.error) {
//       return errorResponse(res, checkout.error, 400);
//     }

//     const { totalAmount } = checkout;
//     if (totalAmount <= 0) {
//       return errorResponse(res, "Invalid order total", 400);
//     }

//     const { client: razorpay, keyId } = await getRazorpayClient(checkout.storeId);
//     // const razorpay = getRazorpayClient();
//     const razorpayOrder = await razorpay.orders.create({
//       amount: Math.round(totalAmount * 100),
//       currency: req.body.currency || "INR",
//       receipt: `rcpt_${Date.now()}_${req.customer.id}`,
//       notes: {
//         store_id: String(checkout.storeId),
//         customer_id: String(checkout.customerId),
//       },
//     });

//     return successResponse(res, {
//       razorpay_order_id: razorpayOrder.id,
//       amount: razorpayOrder.amount,
//       currency: razorpayOrder.currency,
//       key_id: keyId,
//       // key_id: process.env.RAZORPAY_KEY_ID,
//     });
//   } catch (error) {
//     logger.error("Create payment error:", error);
//     return errorResponse(
//       res,
//       error.message || "Failed to create payment order",
//       error.message?.includes("Razorpay credentials") ? 503 : 500
//     );
//   } finally {
//     connection.release();
//   }
// };

// const createPaidOrder = async (connection, req, checkout, paymentDetails) => {
//   const {
//     storeId,
//     customerId,
//     scope,
//     customer,
//     orderItems,
//     subtotal,
//     discountAmount,
//     appliedCouponCode,
//     appliedCouponId,
//     shippingCharge,
//     taxAmount,
//     gstAmount,
//     totalAmount,
//   } = checkout;

//   const {
//     shipping_name,
//     shipping_phone,
//     shipping_address,
//     shipping_city,
//     shipping_state,
//     shipping_pincode,
//     shipping_country,
//     billing_name,
//     billing_phone,
//     billing_address,
//     billing_city,
//     billing_state,
//     billing_pincode,
//     billing_country,
//   } = req.body;

//   const orderNumber = generateOrderNumber();

//   const [orderResult] = await connection.query(
//     `INSERT INTO orders
//       (store_id, order_number, customer_id, email, phone,
//        shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, shipping_country,
//        billing_name, billing_phone, billing_address, billing_city, billing_state, billing_pincode, billing_country,
//        subtotal, discount_amount, coupon_id, coupon_code, shipping_charge, tax_amount, gst_amount, total_amount,
//        paid_amount, due_amount, payment_method, payment_status, payment_id, payment_gateway, payment_reference,
//        order_status, is_paid, is_cod)
//      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//     [
//       storeId,
//       orderNumber,
//       customerId,
//       customer.email,
//       customer.phone || shipping_phone,
//       shipping_name,
//       shipping_phone,
//       shipping_address,
//       shipping_city,
//       shipping_state,
//       shipping_pincode,
//       shipping_country || "India",
//       billing_name || shipping_name,
//       billing_phone || shipping_phone,
//       billing_address || shipping_address,
//       billing_city || shipping_city,
//       billing_state || shipping_state,
//       billing_pincode || shipping_pincode,
//       billing_country || shipping_country || "India",
//       subtotal,
//       discountAmount,
//       appliedCouponId,
//       appliedCouponCode,
//       shippingCharge,
//       taxAmount,
//       gstAmount,
//       totalAmount,
//       totalAmount,
//       0,
//       "online",
//       "paid",
//       paymentDetails.razorpay_payment_id,
//       "razorpay",
//       paymentDetails.razorpay_order_id,
//       "confirmed",
//       1,
//       0,
//     ]
//   );

//   const orderId = orderResult.insertId;

//   for (const item of orderItems) {
//     await connection.query(
//       `INSERT INTO order_items
//         (store_id, order_id, product_id, product_name, product_sku, variant_id, variant_info,
//          quantity, price, offer_price, total_price, gst_percent, gst_amount, image)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         storeId,
//         orderId,
//         item.product_id,
//         item.product_name,
//         item.sku,
//         item.variant_id,
//         item.variant_info ? JSON.stringify(item.variant_info) : null,
//         item.quantity,
//         item.price,
//         item.offer_price,
//         item.total_price,
//         item.gst_percent,
//         item.gst_amount,
//         item.image,
//       ]
//     );

//     await connection.query(
//       "UPDATE products SET stock = stock - ? WHERE id = ? AND store_id = ?",
//       [item.quantity, item.product_id, storeId]
//     );
//     try {
//       await connection.query(
//         "UPDATE inventory SET quantity = quantity - ?, available_quantity = available_quantity - ? WHERE product_id = ? AND store_id = ?",
//         [item.quantity, item.quantity, item.product_id, storeId]
//       );
//     } catch (inventoryError) {
//       logger.warn("Inventory update skipped:", inventoryError.message);
//     }
//     if (item.variant_id) {
//       await connection.query(
//         "UPDATE product_variants SET stock = GREATEST(stock - ?, 0) WHERE id = ? AND store_id = ?",
//         [item.quantity, item.variant_id, storeId]
//       );
//     }
//     try {
//       await connection.query(
//         "INSERT INTO inventory_logs (store_id, product_id, type, quantity, reference_type, reference_id, notes) VALUES (?, ?, 'sale', ?, 'order', ?, ?)",
//         [storeId, item.product_id, -item.quantity, orderId, `Order #${orderNumber}`]
//       );
//     } catch (logError) {
//       logger.warn("Inventory log skipped:", logError.message);
//     }
//   }

//   await connection.query(
//     "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'paid', 'Payment completed successfully', NULL)",
//     [storeId, orderId]
//   );
//   await connection.query(
//     "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'confirmed', 'Order confirmed', NULL)",
//     [storeId, orderId]
//   );

//   await connection.query(
//     `INSERT INTO order_notes (store_id, order_id, note, note_type, is_visible_to_customer)
//      VALUES (?, ?, 'Customer placed online paid order', 'system', 1)`,
//     [storeId, orderId]
//   );

//   if (appliedCouponCode) {
//     await recordCouponUsage(connection, {
//       couponCode: appliedCouponCode,
//       customerId,
//       orderId,
//       discountAmount,
//       storeId,
//     });
//   }

//   const cartWhere = cartWhereClause(scope);
//   await connection.query(`DELETE FROM cart WHERE ${cartWhere.clause}`, cartWhere.params);

//   await connection.query(
//     "UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ? AND store_id = ?",
//     [totalAmount, customerId, storeId]
//   );

//   const [orders] = await connection.query(
//   "SELECT * FROM orders WHERE id = ? AND store_id = ?",
//   [orderId, storeId]
// );

// const [savedItems] = await connection.query(
//   "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
//   [orderId, storeId]
// );

// if (!orders.length) {
//   throw new Error("Order created but not found before commit");
// }

// return { order: orders[0], items: savedItems };
//   // const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
//   // const savedItems = await query(
//   //   "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
//   //   [orderId, storeId]
//   // );

//   // return { order: orders[0], items: savedItems };
// };

// const verifyPayment = async (req, res) => {
//   const connection = await getConnection();
//   try {
//     const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

//     if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
//       return errorResponse(res, "Payment verification details are required", 400);
//     }

//     const storeId = getStoreId(req);
//     const { keySecret } = await getRazorpayClient(storeId);
//     // const keySecret = process.env.RAZORPAY_KEY_SECRET;
//     // if (!keySecret) {
//     //   return errorResponse(res, "Payment gateway is not configured", 503);
//     // }

//     const expectedSignature = crypto
//       .createHmac("sha256", keySecret)
//       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       return errorResponse(res, "Invalid payment signature", 400);
//     }

//     const checkout = await prepareCheckoutTotals(req, connection);
//     if (checkout.error) {
//       return errorResponse(res, checkout.error, 400);
//     }

//     await connection.beginTransaction();

//     const result = await createPaidOrder(connection, req, checkout, {
//       razorpay_payment_id,
//       razorpay_order_id,
//     });

//     await connection.commit();

//     const savedOrder = result.order;
//     return successResponse(
//       res,
//       {
//         order: {
//           id: savedOrder.id,
//           order_number: savedOrder.order_number,
//           total_amount: savedOrder.total_amount,
//           subtotal: savedOrder.subtotal,
//           discount_amount: savedOrder.discount_amount,
//           shipping_charge: savedOrder.shipping_charge,
//           tax_amount: savedOrder.tax_amount,
//           payment_method: savedOrder.payment_method,
//           payment_status: savedOrder.payment_status,
//           order_status: savedOrder.order_status,
//           shipping_name: savedOrder.shipping_name,
//           shipping_phone: savedOrder.shipping_phone,
//           shipping_address: savedOrder.shipping_address,
//           shipping_city: savedOrder.shipping_city,
//           shipping_state: savedOrder.shipping_state,
//           shipping_pincode: savedOrder.shipping_pincode,
//           shipping_country: savedOrder.shipping_country,
//           created_at: savedOrder.created_at,
//         },
//         items: result.items,
//       },
//       "Payment verified and order placed successfully",
//       201
//     );
//   } catch (error) {
//     try {
//       await connection.rollback();
//     } catch {
//       // ignore rollback errors
//     }
//     logger.error("Verify payment error:", error);
//     return errorResponse(
//       res,
//       error.sqlMessage || error.message || "Failed to verify payment",
//       500
//     );
//   } finally {
//     connection.release();
//   }
// };

// module.exports.createPayment = createPayment;
// module.exports.verifyPayment = verifyPayment;
