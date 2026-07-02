const { query, getConnection } = require("../config/db");
const { generateOrderNumber } = require("../helpers/generateHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const { cartWhereClause, resolveCartScope } = require("../helpers/cartHelper");
const { recordCouponUsage } = require("./couponController");
const logger = require("../config/logger");
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
      pv.stock AS variant_stock
     FROM cart c
     INNER JOIN products p ON p.id = c.product_id AND p.store_id = c.store_id
     LEFT JOIN product_variants pv ON pv.id = c.variant_id AND pv.store_id = c.store_id
     WHERE ${where.clause}
     ORDER BY c.updated_at DESC`,
    where.params
  );
};

const checkout = async (req, res) => {
  const connection = await getConnection();
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const scope = resolveCartScope(req);

    if (!scope.customerId) {
      scope.customerId = customerId;
    }

    const cartItems = await fetchCartItemsForCheckout(scope);
    if (!cartItems.length) {
      return errorResponse(res, "Your cart is empty", 400);
    }

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
      payment_method,
      coupon_id,
      coupon_code,
      discount_amount: clientDiscountAmount,
      subtotal: clientSubtotal,
      shipping_charge: clientShippingCharge,
      tax_amount: clientTaxAmount,
      total_amount: clientTotalAmount,
      notes,
      shipping_charge = 0,
    } = req.body;

    if (!shipping_name || !shipping_phone || !shipping_address || !shipping_city || !shipping_state || !shipping_pincode) {
      return errorResponse(res, "Complete shipping address is required", 400);
    }

    const customers = await query(
      "SELECT id, email, phone, first_name, last_name FROM customers WHERE id = ? AND store_id = ? AND status = 'active'",
      [customerId, storeId]
    );
    if (!customers.length) {
      return errorResponse(res, "Customer account not found or inactive", 404);
    }
    const customer = customers[0];

    let subtotal = 0;
    const orderItems = [];

    for (const item of cartItems) {
      const unitPrice = Number(
        item.item_price || item.variant_offer_price || item.variant_price || item.offer_price || item.price || 0
      );
      const availableStock = item.variant_id ? Number(item.variant_stock ?? item.stock) : Number(item.stock);
      const qty = Number(item.quantity);

      if (availableStock < qty) {
        return errorResponse(res, `Insufficient stock for ${item.name}`, 400);
      }

      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;

      const variantInfo = {};
      if (item.selected_size || item.variant_size) variantInfo.size = item.selected_size || item.variant_size;
      if (item.selected_color || item.variant_color) variantInfo.color = item.selected_color || item.variant_color;

      orderItems.push({
        product_id: item.product_id,
        product_name: item.name,
        sku: item.sku,
        variant_id: item.variant_id,
        variant_info: Object.keys(variantInfo).length ? variantInfo : null,
        quantity: qty,
        price: unitPrice,
        offer_price: unitPrice,
        total_price: lineTotal,
        gst_percent: Number(item.gst_percent || 0),
        gst_amount: 0,
        image: item.thumbnail,
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
        return errorResponse(res, "Invalid or expired coupon", 400);
      }

      const coupon = coupons[0];
      if (coupon.minimum_order_amount && subtotal < parseFloat(coupon.minimum_order_amount)) {
        return errorResponse(res, `Minimum order amount is ₹${coupon.minimum_order_amount}`, 400);
      }
      if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
        return errorResponse(res, "Coupon usage limit reached", 400);
      }

      discountAmount = calculateDiscount(coupon, subtotal);
      appliedCouponCode = coupon.code;
      appliedCouponId = coupon.id;
    }

    const shippingCharge = Number(clientShippingCharge ?? shipping_charge) || 0;
    const taxAmount = Number(clientTaxAmount) || 0;
    const totalAmount = Math.max(
      0,
      Number(clientTotalAmount) ||
        subtotal - discountAmount + shippingCharge + taxAmount
    );
    const orderNumber = generateOrderNumber();
    const payMethod = payment_method || "cod";

    await connection.beginTransaction();

    const [orderResult] = await connection.query(
      `INSERT INTO orders
        (store_id, order_number, customer_id, email, phone,
         shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, shipping_country,
         billing_name, billing_phone, billing_address, billing_city, billing_state, billing_pincode, billing_country,
         subtotal, discount_amount, shipping_charge, tax_amount, total_amount,
         payment_method, payment_status, order_status, coupon_id, coupon_code, notes, is_cod, is_paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        clientSubtotal != null && !isNaN(clientSubtotal) ? parseFloat(clientSubtotal) : subtotal,
        discountAmount,
        shippingCharge,
        taxAmount,
        totalAmount,
        payMethod,
        payMethod === "cod" ? "pending" : "pending",
        "pending",
        appliedCouponId,
        appliedCouponCode,
        notes || null,
        payMethod === "cod" ? 1 : 0,
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
      "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'pending', 'Order placed successfully', NULL)",
      [storeId, orderId]
    );

    await connection.query(
      `INSERT INTO order_notes (store_id, order_id, note, note_type, is_visible_to_customer)
       VALUES (?, ?, 'Customer placed order', 'system', 1)`,
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

    await connection.commit();

    const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
    const savedOrder = orders[0];
    const savedItems = await query(
      "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
      [orderId, storeId]
    );

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
          payment_method: savedOrder.payment_method,
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
        items: savedItems,
      },
      "Order placed successfully",
      201
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    logger.error("Checkout error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to place order",
      500
    );
  } finally {
    connection.release();
  }
};

const getMyOrders = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      "SELECT COUNT(*) as total FROM orders WHERE store_id = ? AND customer_id = ?",
      [storeId, customerId]
    );
    const total = countResult[0].total;

    const orders = await query(
      `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
              o.total_amount, o.subtotal, o.discount_amount, o.shipping_charge,
              o.created_at, o.delivered_at,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.store_id = o.store_id) AS items_count,
              (SELECT oi.image FROM order_items oi WHERE oi.order_id = o.id AND oi.store_id = o.store_id ORDER BY oi.id ASC LIMIT 1) AS first_item_image,
              (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = o.id AND oi.store_id = o.store_id ORDER BY oi.id ASC LIMIT 1) AS first_product_id,
              (SELECT p.slug
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id AND p.store_id = oi.store_id
               WHERE oi.order_id = o.id AND oi.store_id = o.store_id
               ORDER BY oi.id ASC LIMIT 1) AS product_slug
       FROM orders o
       WHERE o.store_id = ? AND o.customer_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [storeId, customerId, String(limit), String(offset)]
    );

    // const orders = await query(
    //   `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
    //           o.total_amount, o.subtotal, o.discount_amount, o.shipping_charge,
    //           o.created_at, o.delivered_at,
    //           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count
    //    FROM orders o
    //    WHERE o.store_id = ? AND o.customer_id = ?
    //    ORDER BY o.created_at DESC
    //    LIMIT ? OFFSET ?`,
    //   [storeId, customerId, String(limit), String(offset)]
    // );

    return paginatedResponse(res, orders, total, page, limit);
  } catch (error) {
    logger.error("Get my orders error:", error);
    return errorResponse(res, "Failed to fetch orders", 500);
  }
};

const getMyOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;

    const orders = await query(
      "SELECT * FROM orders WHERE id = ? AND store_id = ? AND customer_id = ?",
      [req.params.id, storeId, customerId]
    );
    if (!orders.length) return errorResponse(res, "Order not found", 404);

    const order = orders[0];
    order.items = await query(
      "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
      [order.id, storeId]
    );
    order.timeline = await query(
      "SELECT status, note, created_at FROM order_timeline WHERE order_id = ? AND store_id = ? ORDER BY created_at ASC",
      [order.id, storeId]
    );

    return successResponse(res, order);
  } catch (error) {
    logger.error("Get my order error:", error);
    return errorResponse(res, "Failed to fetch order", 500);
  }
};

module.exports.checkout = checkout;
module.exports.getMyOrders = getMyOrders;
module.exports.getMyOrder = getMyOrder;
