const { query, getConnection } = require("../config/db");
const { generateOrderNumber, generateInvoiceNumber } = require("../helpers/generateHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { recordCouponUsage } = require("./couponController");
const { getStoreId } = require("../helpers/storeHelper");
const {
  applyShiprocketStatusToOrder,
  assignAwb,
  createAdhocOrder,
  extractTrackingStatus,
  extractTrackingUrl,
  getShiprocketConfig,
  trackByAwb,
  generateShiprocketLabel,
  requestShiprocketPickup,
} = require("../helpers/shiprocketHelper");
const logger = require("../config/logger");


const roundQuantity = (value) =>
  Math.round(
    (Number(value) +
      Number.EPSILON) *
      100
  ) / 100;

const normalizeOrderItemUnitFields = (
  item = {}
) => {
  const saleMode = [
    "piece",
    "size",
    "meter",
  ].includes(
    String(item.sale_mode || "")
      .trim()
      .toLowerCase()
  )
    ? String(item.sale_mode)
        .trim()
        .toLowerCase()
    : "piece";

  const isMeter =
    saleMode === "meter";

  return {
    saleMode,
    unitName: String(
      item.unit_name ||
        (isMeter
          ? "meter"
          : "piece")
    ).trim(),

    minimumQuantity:
      isMeter
        ? Math.max(
            0.01,
            Number(
              item.minimum_quantity ||
                1
            )
          )
        : 1,

    quantityStep:
      isMeter
        ? Math.max(
            0.01,
            Number(
              item.quantity_step ||
                0.5
            )
          )
        : 1,
  };
};

const isValidQuantityStep = (
  quantity,
  minimum,
  step
) => {
  if (
    quantity < minimum ||
    step <= 0
  ) {
    return false;
  }

  const numberOfSteps =
    (quantity - minimum) / step;

  return (
    Math.abs(
      numberOfSteps -
        Math.round(numberOfSteps)
    ) < 0.000001
  );
};

// @desc    Get order statistics for admin dashboard
// @route   GET /api/orders/stats
const getOrderStats = async (req, res) => {
  try {
    const storeId = getStoreId(req);

    const statusRows = await query(
      `SELECT order_status, COUNT(*) as count
       FROM orders WHERE store_id = ?
       GROUP BY order_status`,
      [storeId]
    );

    const paymentRows = await query(
      `SELECT payment_status, COUNT(*) as count
       FROM orders WHERE store_id = ?
       GROUP BY payment_status`,
      [storeId]
    );

    const totalsRows = await query(
      `SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) as today_orders,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as today_revenue
       FROM orders WHERE store_id = ?`,
      [storeId]
    );
    const totals = totalsRows[0];

    const byStatus = {};
    for (const row of statusRows) {
      byStatus[row.order_status] = row.count;
    }

    const byPayment = {};
    for (const row of paymentRows) {
      byPayment[row.payment_status] = row.count;
    }

    return successResponse(res, {
      total_orders: totals.total_orders,
      total_revenue: totals.total_revenue,
      today_orders: totals.today_orders,
      today_revenue: totals.today_revenue,
      by_status: byStatus,
      by_payment: byPayment,
    });
  } catch (error) {
    logger.error("Get order stats error:", error);
    return errorResponse(res, "Failed to fetch order statistics", 500);
  }
};

// @desc    Get all orders
// @route   GET /api/orders
const getOrders = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";
    const payment_status = req.query.payment_status || "";
    const start_date = req.query.start_date || "";
    const end_date = req.query.end_date || "";
    const sort = req.query.sort || "created_at";
    const order = req.query.order || "DESC";

    let whereClause = "WHERE o.store_id = ?";
    const params = [storeId];

    if (search) {
      whereClause += " AND (o.order_number LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.shipping_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { whereClause += " AND o.order_status = ?"; params.push(status); }
    if (payment_status) { whereClause += " AND o.payment_status = ?"; params.push(payment_status); }
    if (start_date) { whereClause += " AND o.created_at >= ?"; params.push(start_date); }
    if (end_date) { whereClause += " AND o.created_at <= ?"; params.push(end_date + " 23:59:59"); }

    const allowedSorts = ["created_at", "total_amount", "order_status", "order_number"];
    const sortColumn = allowedSorts.includes(sort) ? `o.${sort}` : "o.created_at";
    const sortOrder = order === "ASC" ? "ASC" : "DESC";

    const countResult = await query(`SELECT COUNT(*) as total FROM orders o ${whereClause}`, params);
    const total = countResult[0].total;

    const orders = await query(
      `SELECT o.*, c.first_name, c.last_name, c.email as customer_email,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, orders, total, page, limit);
  } catch (error) {
    logger.error("Get orders error:", error);
    return errorResponse(res, "Failed to fetch orders", 500);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
const getOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!orders.length) return errorResponse(res, "Order not found", 404);

    const order = orders[0];
    order.items = await query("SELECT * FROM order_items WHERE order_id = ? AND store_id = ?", [order.id, storeId]);
    order.timeline = await query("SELECT * FROM order_timeline WHERE order_id = ? AND store_id = ? ORDER BY created_at ASC", [order.id, storeId]);
    order.notes = await query("SELECT * FROM order_notes WHERE order_id = ? AND store_id = ? ORDER BY created_at DESC", [order.id, storeId]);

    if (order.customer_id) {
      const customers = await query("SELECT id, first_name, last_name, email, phone FROM customers WHERE id = ? AND store_id = ?", [order.customer_id, storeId]);
      order.customer = customers.length ? customers[0] : null;
    }

    return successResponse(res, order);
  } catch (error) {
    logger.error("Get order error:", error);
    return errorResponse(res, "Failed to fetch order", 500);
  }
};

// @desc    Create order (admin)
// @route   POST /api/orders
const createOrder = async (req, res) => {
  const connection = await getConnection();
  try {
    const storeId = getStoreId(req);
    await connection.beginTransaction();
    const {
      customer_id, email, phone, items,
      shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode,
      billing_name, billing_phone, billing_address, billing_city, billing_state, billing_pincode,
      subtotal, discount_amount, shipping_charge, tax_amount, total_amount,
      payment_method, payment_status, coupon_code, notes,
    } = req.body;

    const orderNumber = generateOrderNumber();

    const result = await connection.query(
      `INSERT INTO orders (store_id, order_number, customer_id, email, phone, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, billing_name, billing_phone, billing_address, billing_city, billing_state, billing_pincode, subtotal, discount_amount, shipping_charge, tax_amount, total_amount, payment_method, payment_status, coupon_code, notes, created_by, is_cod) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [storeId, orderNumber, customer_id || null, email || null, phone || null, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, billing_name || shipping_name, billing_phone || shipping_phone, billing_address || shipping_address, billing_city || shipping_city, billing_state || shipping_state, billing_pincode || shipping_pincode, subtotal || 0, discount_amount || 0, shipping_charge || 0, tax_amount || 0, total_amount || 0, payment_method || "cod", payment_status || "pending", coupon_code || null, notes || null, req.admin?.id || null, payment_method === "cod" ? 1 : 0]
    );

    const orderId = result[0].insertId;


    // Insert order items
    if (items && items.length) {
      for (const item of items) {
            const unitFields =
  normalizeOrderItemUnitFields(
    item
  );

const itemQuantity =
  roundQuantity(item.quantity);

if (
  !Number.isFinite(itemQuantity) ||
  itemQuantity <= 0
) {
  await connection.rollback();

  return errorResponse(
    res,
    `Invalid quantity for ${
      item.product_name ||
      "product"
    }`,
    400
  );
}

if (
  unitFields.saleMode !== "meter" &&
  !Number.isInteger(itemQuantity)
) {
  await connection.rollback();

  return errorResponse(
    res,
    `${
      item.product_name ||
      "Product"
    } quantity must be a whole number`,
    400
  );
}

if (
  !isValidQuantityStep(
    itemQuantity,
    unitFields.minimumQuantity,
    unitFields.quantityStep
  )
) {
  await connection.rollback();

  return errorResponse(
    res,
    `Invalid quantity increment for ${
      item.product_name ||
      "product"
    }`,
    400
  );
}
        
        // await connection.query(
        //   "INSERT INTO order_items (store_id, order_id, product_id, product_name, product_sku, variant_id, variant_info, quantity, price, offer_price, total_price, gst_percent, gst_amount, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        //   [storeId, orderId, item.product_id, item.product_name, item.sku || null, item.variant_id || null, item.variant_info ? JSON.stringify(item.variant_info) : null, item.quantity, item.price, item.offer_price || null, item.total_price, item.gst_percent || 0, item.gst_amount || 0, item.image || null]
        // );
        await connection.query(
  `INSERT INTO order_items
   (
     store_id,
     order_id,
     product_id,
     product_name,
     product_sku,
     variant_id,
     variant_info,

     sale_mode,
     unit_name,
     minimum_quantity,
     quantity_step,

     quantity,
     price,
     offer_price,
     total_price,
     gst_percent,
     gst_amount,
     image
   )
   VALUES (
     ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?, ?
   )`,
  [
    storeId,
    orderId,
    item.product_id,
    item.product_name,
    item.sku || null,
    item.variant_id || null,
    item.variant_info
      ? JSON.stringify(
          item.variant_info
        )
      : null,

    unitFields.saleMode,
    unitFields.unitName,
    unitFields.minimumQuantity,
    unitFields.quantityStep,

    itemQuantity,
    item.price,
    item.offer_price || null,
    item.total_price,
    item.gst_percent || 0,
    item.gst_amount || 0,
    item.image || null,
  ]
);

        // Update product stock
        if (item.product_id) {
          // await connection.query("UPDATE products SET stock = stock - ? WHERE id = ? AND store_id = ?", [itemQuantity, item.product_id, storeId]);
          await connection.query(
  `UPDATE products
   SET stock =
     GREATEST(stock - ?, 0)
   WHERE id = ?
     AND store_id = ?`,
  [
    itemQuantity,
    item.product_id,
    storeId,
  ]
);
          // await connection.query("UPDATE inventory SET quantity = quantity - ?, available_quantity = available_quantity - ? WHERE product_id = ? AND store_id = ?", [itemQuantity, itemQuantity, item.product_id, storeId]);
          await connection.query(
  `UPDATE inventory
   SET
     quantity =
       GREATEST(quantity - ?, 0),
     available_quantity =
       GREATEST(
         available_quantity - ?,
         0
       )
   WHERE product_id = ?
     AND store_id = ?`,
  [
    itemQuantity,
    itemQuantity,
    item.product_id,
    storeId,
  ]
);
          if (item.variant_id) {
            await connection.query("UPDATE product_variants SET stock = GREATEST(stock - ?, 0) WHERE id = ? AND store_id = ?", [itemQuantity, item.variant_id, storeId]);
          }
          await connection.query("INSERT INTO inventory_logs (store_id, product_id, type, quantity, reference_type, reference_id, notes) VALUES (?, ?, 'sale', ?, 'order', ?, ?)", [storeId, item.product_id, -itemQuantity, orderId, `Order #${orderNumber}`]);
        }
      }
    }

    // Add timeline entry
    await connection.query(
      "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'pending', 'Order created', ?)",
      [storeId, orderId, req.admin?.id || null]
    );

    if (coupon_code) {
      await recordCouponUsage(connection, {
        couponCode: coupon_code,
        customerId: customer_id,
        orderId,
        discountAmount: discount_amount || 0,
        storeId,
      });
    }

    await connection.commit();
    const order = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
    return successResponse(res, order[0], "Order created successfully", 201);
  } catch (error) {
    await connection.rollback();
    logger.error("Create order error:", error);
    return errorResponse(res, "Failed to create order", 500);
  } finally {
    connection.release();
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { status, note } = req.body;
    const validStatuses = [
      "pending",
      "confirmed",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "returned",
      "refunded",
    ];

    if (!validStatuses.includes(status)) {
      return errorResponse(res, "Invalid order status", 400);
    }

    const existing = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Order not found", 404);

    const updateData = { order_status: status };
    if (status === "delivered") updateData.delivered_at = new Date();
    if (status === "delivered" && !existing[0].invoice_number) {
      updateData.invoice_number = generateInvoiceNumber(existing[0].id);
      updateData.invoice_generated_at = new Date();
    }

    await query("UPDATE orders SET order_status = ?, delivered_at = COALESCE(?, delivered_at), invoice_number = COALESCE(?, invoice_number), invoice_generated_at = COALESCE(?, invoice_generated_at) WHERE id = ? AND store_id = ?",
      [status, status === "delivered" ? new Date() : null, updateData.invoice_number || null, updateData.invoice_generated_at || null, req.params.id, storeId]
    );

    // Add timeline
    await query("INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [storeId, req.params.id, status, note || `Order status changed to ${status}`, req.admin?.id || null]
    );

    // Update product sales if delivered
    if (status === "delivered" && existing[0].order_status !== "delivered") {
      const items = await query("SELECT product_id, quantity FROM order_items WHERE order_id = ? AND store_id = ?", [req.params.id, storeId]);
      for (const item of items) {
  //       const restoreQuantity =
  // roundQuantity(item.quantity);
  const soldQuantity =
  roundQuantity(item.quantity);

if (
  !Number.isFinite(
    restoreQuantity
  ) ||
  restoreQuantity <= 0
) {
  continue;
}
        if (item.product_id) {
          await query("UPDATE products SET total_sales = total_sales + ? WHERE id = ? AND store_id = ?", [restoreQuantity, item.product_id, storeId]);
        }
      }

      if (existing[0].customer_id) {
        await query(
          "UPDATE customers SET total_spent = total_spent + ? WHERE id = ? AND store_id = ?",
          [existing[0].total_amount, existing[0].customer_id, storeId]
        );
      }
    }

    // If cancelled or returned, restore stock
    if (
  (status === "cancelled" ||
    status === "returned") &&
  existing[0].order_status !==
    "cancelled" &&
  existing[0].order_status !==
    "returned"
) {
  const items = await query(
    `SELECT
       product_id,
       variant_id,
       quantity
     FROM order_items
     WHERE order_id = ?
       AND store_id = ?`,
    [req.params.id, storeId]
  );

  for (const item of items) {
    const restoreQuantity =
      roundQuantity(item.quantity);

    if (
      !Number.isFinite(
        restoreQuantity
      ) ||
      restoreQuantity <= 0
    ) {
      continue;
    }

    if (item.product_id) {
      await query(
        `UPDATE products
         SET stock = stock + ?
         WHERE id = ?
           AND store_id = ?`,
        [
          restoreQuantity,
          item.product_id,
          storeId,
        ]
      );

      await query(
        `UPDATE inventory
         SET
           quantity =
             quantity + ?,
           available_quantity =
             available_quantity + ?
         WHERE product_id = ?
           AND store_id = ?`,
        [
          restoreQuantity,
          restoreQuantity,
          item.product_id,
          storeId,
        ]
      );

      if (item.variant_id) {
        await query(
          `UPDATE product_variants
           SET stock = stock + ?
           WHERE id = ?
             AND store_id = ?`,
          [
            restoreQuantity,
            item.variant_id,
            storeId,
          ]
        );
      }

      await query(
        `INSERT INTO inventory_logs
         (
           store_id,
           product_id,
           type,
           quantity,
           reference_type,
           reference_id,
           notes
         )
         VALUES (
           ?, ?, 'return', ?,
           'order', ?, ?
         )`,
        [
          storeId,
          item.product_id,
          restoreQuantity,
          req.params.id,
          `Order ${status}`,
        ]
      );
    }
  }
}
//     if ((status === "cancelled" || status === "returned") && existing[0].order_status !== "cancelled" && existing[0].order_status !== "returned") {
//       const items = await query("SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ? AND store_id = ?", [req.params.id, storeId]);
//       for (const item of items) {
//         if (item.product_id) {
//           // await query("UPDATE products SET stock = stock + ? WHERE id = ? AND store_id = ?", [restoreQuantity, item.product_id, storeId]);
//          await connection.query(
//   `UPDATE products
//    SET stock = GREATEST(stock - ?, 0)
//    WHERE id = ?
//      AND store_id = ?`,
//   [
//     itemQuantity,
//     item.product_id,
//     storeId,
//   ]
// );
//           // await query("UPDATE inventory SET quantity = quantity + ?, available_quantity = available_quantity + ? WHERE product_id = ? AND store_id = ?", [item.quantity, item.quantity, item.product_id, storeId]);
//           await connection.query(
//   `UPDATE inventory
//    SET
//      quantity =
//        GREATEST(quantity - ?, 0),
//      available_quantity =
//        GREATEST(
//          available_quantity - ?,
//          0
//        )
//    WHERE product_id = ?
//      AND store_id = ?`,
//   [
//     itemQuantity,
//     itemQuantity,
//     item.product_id,
//     storeId,
//   ]
// );
//           if (item.variant_id) {
//             await query("UPDATE product_variants SET stock = stock + ? WHERE id = ? AND store_id = ?", [restoreQuantity, item.variant_id, storeId]);
//           }
//           await query("INSERT INTO inventory_logs (store_id, product_id, type, quantity, reference_type, reference_id, notes) VALUES (?, ?, 'return', ?, 'order', ?, ?)",
//             [storeId, item.product_id, restoreQuantity, req.params.id, `Order ${status}`]);
//         }
//       }
//     }

    return successResponse(res, { order_status: status }, "Order status updated successfully");
  } catch (error) {
    logger.error("Update order status error:", error);
    return errorResponse(res, "Failed to update order status", 500);
  }
};

// @desc    Update payment status
// @route   PUT /api/orders/:id/payment
const updatePaymentStatus = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { payment_status, payment_id } = req.body;
    const validStatuses = ["pending", "paid", "failed", "refunded", "partially_refunded"];
    if (!validStatuses.includes(payment_status)) {
      return errorResponse(res, "Invalid payment status", 400);
    }
    await query("UPDATE orders SET payment_status = ?, payment_id = COALESCE(?, payment_id), is_paid = ? WHERE id = ? AND store_id = ?",
      [payment_status, payment_id || null, payment_status === "paid" ? 1 : 0, req.params.id, storeId]
    );
    await query("INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [storeId, req.params.id, `payment_${payment_status}`, `Payment status changed to ${payment_status}`, req.admin?.id || null]
    );
    return successResponse(res, { payment_status }, "Payment status updated");
  } catch (error) {
    logger.error("Update payment error:", error);
    return errorResponse(res, "Failed to update payment status", 500);
  }
};

// @desc    Add order note
// @route   POST /api/orders/:id/notes
const addOrderNote = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { note, note_type, is_visible_to_customer } = req.body;
    if (!note) return errorResponse(res, "Note is required", 400);
    await query("INSERT INTO order_notes (store_id, order_id, note, note_type, created_by, is_visible_to_customer) VALUES (?, ?, ?, ?, ?, ?)",
      [storeId, req.params.id, note, note_type || "admin", req.admin?.id || null, is_visible_to_customer || 0]
    );
    return successResponse(res, null, "Note added successfully", 201);
  } catch (error) {
    logger.error("Add order note error:", error);
    return errorResponse(res, "Failed to add note", 500);
  }
};

// @desc    Generate invoice
// @route   GET /api/orders/:id/invoice
const generateInvoice = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!orders.length) return errorResponse(res, "Order not found", 404);

    const order = orders[0];
    if (!order.invoice_number) {
      const invoiceNumber = generateInvoiceNumber(order.id);
      await query("UPDATE orders SET invoice_number = ?, invoice_generated_at = NOW() WHERE id = ? AND store_id = ?", [invoiceNumber, order.id, storeId]);
      order.invoice_number = invoiceNumber;
    }

    order.items = await query("SELECT * FROM order_items WHERE order_id = ? AND store_id = ?", [order.id, storeId]);
    return successResponse(res, order, "Invoice generated");
  } catch (error) {
    logger.error("Generate invoice error:", error);
    return errorResponse(res, "Failed to generate invoice", 500);
  }
};

// @desc    Delete order
// @route   DELETE /api/orders/:id
const deleteOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    await query("DELETE FROM orders WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Order deleted");
  } catch (error) {
    logger.error("Delete order error:", error);
    return errorResponse(res, "Failed to delete order", 500);
  }
};

// @desc    Create Shiprocket shipment for an order
// @route   POST /api/orders/:id/shiprocket/create-shipment
const createShiprocketShipment = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orderId = req.params.id;

    const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
    if (!orders.length) return errorResponse(res, "Order not found", 404);

    const order = orders[0];
    if (order.awb_code) {
      return errorResponse(res, "Shiprocket shipment already exists for this order", 400);
    }

    const shiprocketConfig = await getShiprocketConfig(storeId);
    // await getShiprocketConfig(storeId);

    const orderItems = await query(
      "SELECT * FROM order_items WHERE order_id = ? AND store_id = ?",
      [orderId, storeId]
    );
    if (!orderItems.length) {
      return errorResponse(res, "Order has no items to ship", 400);
    }

    // const { weight, length, breadth, height, courier_id } = req.body || {};
    const {
      weight = 0.5,
      length = 10,
      breadth = 10,
      height = 10,
      courier_id = null,
      pickup_location = shiprocketConfig.pickupLocation,
      // pickup_location = "Primary",
    } = req.body || {};

    if (!pickup_location) {
        return errorResponse(res, "Shiprocket pickup location is not configured", 400);
      }

    const adhocResponse = await createAdhocOrder(storeId, order, orderItems, {
      
  weight: Number(weight),
  length: Number(length),
  breadth: Number(breadth),
  height: Number(height),
  pickup_location,
});
console.log("SHIPROCKET ADHOC RESPONSE:");
console.log(JSON.stringify(adhocResponse, null, 2));
    // const adhocResponse = await createAdhocOrder(storeId, order, orderItems, {
    //   weight,
    //   length,
    //   breadth,
    //   height,
    // });

    const shiprocketOrderId =
      adhocResponse.order_id ||
      adhocResponse.shiprocket_order_id ||
      adhocResponse.data?.order_id ||
      null;
    const shipmentId =
      adhocResponse.shipment_id ||
      adhocResponse.data?.shipment_id ||
      (Array.isArray(adhocResponse.data) ? adhocResponse.data[0]?.shipment_id : null);

    if (!shipmentId) {
      logger.error("Shiprocket adhoc order missing shipment_id:", adhocResponse);
      return errorResponse(res, "Shiprocket did not return a shipment ID", 502);
    }

    // const awbResponse = await assignAwb(storeId, shipmentId, courier_id || null);
    // const awbPayload = awbResponse.response?.data || awbResponse.data || awbResponse;

    // const awbCode =
    //   awbPayload.awb_code ||
    //   awbPayload.awb ||
    //   awbResponse.awb_code ||
    //   null;
    // const courierName =
    //   awbPayload.courier_name ||
    //   awbPayload.courier ||
    //   awbResponse.courier_name ||
    //   null;
    // const trackingUrl = extractTrackingUrl(awbResponse);

    // if (!awbCode) {
    //   logger.error("Shiprocket AWB assignment missing awb_code:", awbResponse);
    //   return errorResponse(res, "Shiprocket did not return an AWB code", 502);
    // }

    await query(
  `UPDATE orders
   SET shiprocket_order_id = ?,
       shiprocket_shipment_id = ?,
       shipping_method = 'Shiprocket',
       order_status = 'packed'
   WHERE id = ? AND store_id = ?`,
  [
    shiprocketOrderId ? String(shiprocketOrderId) : null,
    String(shipmentId),
    orderId,
    storeId,
  ]
);
    // await query(
    //   `UPDATE orders
    //    SET shiprocket_order_id = ?,
    //        shiprocket_shipment_id = ?,
    //        awb_code = ?,
    //        tracking_number = ?,
    //        tracking_url = COALESCE(?, tracking_url),
    //        courier_name = ?,
    //        shipping_method = COALESCE(?, shipping_method),
    //        order_status = 'shipped'
    //    WHERE id = ? AND store_id = ?`,
    //   [
    //     shiprocketOrderId ? String(shiprocketOrderId) : null,
    //     String(shipmentId),
    //     awbCode,
    //     awbCode,
    //     trackingUrl,
    //     courierName,
    //     courierName || "Shiprocket",
    //     orderId,
    //     storeId,
    //   ]
    // );

    await query(
  "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'packed', ?, ?)",
  [
    storeId,
    orderId,
    `Shiprocket shipment created. Shipment ID: ${shipmentId}`,
    req.admin?.id || null,
  ]
);
    // await query(
    //   "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'shipped', ?, ?)",
    //   [
    //     storeId,
    //     orderId,
    //     `Shiprocket shipment created. AWB: ${awbCode}${courierName ? ` via ${courierName}` : ""}`,
    //     req.admin?.id || null,
    //   ]
    // );

    const updated = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);

    return successResponse(
  res,
  {
    order: updated[0],
    shiprocket: {
      shiprocket_order_id: shiprocketOrderId,
      shiprocket_shipment_id: shipmentId,
    },
  },
  "Shiprocket shipment created successfully"
);
    // return successResponse(
    //   res,
    //   {
    //     order: updated[0],
    //     shiprocket: {
    //       shiprocket_order_id: shiprocketOrderId,
    //       shiprocket_shipment_id: shipmentId,
    //       awb_code: awbCode,
    //       courier_name: courierName,
    //       tracking_url: trackingUrl,
    //     },
    //   },
    //   "Shiprocket shipment created successfully"
    // );
  } catch (error) {
    logger.error("Create Shiprocket shipment error:", error);
    const statusCode =
      error.message?.includes("disabled") || error.message?.includes("not configured") ? 503 : 500;
    return errorResponse(res, error.message || "Failed to create Shiprocket shipment", statusCode);
  }
};

// @desc    Sync Shiprocket tracking status for an order
// @route   POST /api/orders/:id/shiprocket/sync-tracking
const syncShiprocketTracking = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orderId = req.params.id;

    const orders = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
    if (!orders.length) return errorResponse(res, "Order not found", 404);

    const order = orders[0];
    const awbCode = order.awb_code || order.tracking_number;
    if (!awbCode) {
      return errorResponse(res, "No AWB or tracking number found for this order", 400);
    }

    await getShiprocketConfig(storeId);
    const trackingPayload = await trackByAwb(storeId, awbCode);
    const shiprocketStatus = extractTrackingStatus(trackingPayload);

    if (!shiprocketStatus) {
      return errorResponse(res, "Could not determine shipment status from Shiprocket", 502);
    }

    const trackingUrl = extractTrackingUrl({}, trackingPayload);
    const courierName =
      trackingPayload.tracking_data?.courier_name ||
      trackingPayload.courier_name ||
      order.courier_name ||
      null;

    if (trackingUrl || courierName) {
      await query(
        `UPDATE orders
         SET tracking_url = COALESCE(?, tracking_url),
             courier_name = COALESCE(?, courier_name)
         WHERE id = ? AND store_id = ?`,
        [trackingUrl, courierName, orderId, storeId]
      );
    }

    const result = await applyShiprocketStatusToOrder({
      storeId,
      orderId,
      shiprocketStatus,
      note: `Tracking synced from Shiprocket: ${shiprocketStatus}`,
      createdBy: req.admin?.id || null,
    });

    const updated = await query("SELECT * FROM orders WHERE id = ? AND store_id = ?", [orderId, storeId]);
    const timeline = await query(
      "SELECT * FROM order_timeline WHERE order_id = ? AND store_id = ? ORDER BY created_at ASC",
      [orderId, storeId]
    );

    return successResponse(
      res,
      {
        order: updated[0],
        timeline,
        shiprocket_status: shiprocketStatus,
        mapped_status: result.order_status,
        updated: result.updated,
      },
      "Tracking synced successfully"
    );
  } catch (error) {
    logger.error("Sync Shiprocket tracking error:", error);
    const statusCode =
      error.message?.includes("disabled") || error.message?.includes("not configured") ? 503 : 500;
    return errorResponse(res, error.message || "Failed to sync Shiprocket tracking", statusCode);
  }
};

// @desc    Export orders
// @route   GET /api/orders/export
const exportOrders = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orders = await query(
      `SELECT o.order_number, o.order_status, o.payment_status, o.total_amount, o.shipping_name, o.shipping_city, o.created_at,
        c.first_name, c.last_name, c.email as customer_email
       FROM orders o LEFT JOIN customers c ON o.customer_id = c.id AND c.store_id = o.store_id
       WHERE o.store_id = ? ORDER BY o.created_at DESC`,
      [storeId]
    );
    return successResponse(res, orders);
  } catch (error) {
    logger.error("Export orders error:", error);
    return errorResponse(res, "Failed to export orders", 500);
  }
};

const assignShiprocketAwb = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orderId = req.params.id;
    const { courier_id = null } = req.body || {};

    const rows = await query(
      "SELECT id, shiprocket_shipment_id, awb_code FROM orders WHERE id = ? AND store_id = ?",
      [orderId, storeId]
    );

    if (!rows.length) {
      return errorResponse(res, "Order not found", 404);
    }

    const order = rows[0];

    if (!order.shiprocket_shipment_id) {
      return errorResponse(res, "Shipment not created yet", 400);
    }

    if (order.awb_code) {
      return errorResponse(res, "AWB already assigned for this order", 400);
    }

    await getShiprocketConfig(storeId);

    const awbResponse = await assignAwb(
      storeId,
      order.shiprocket_shipment_id,
      courier_id || null
    );

    const awbPayload =
      awbResponse.response?.data ||
      awbResponse.data ||
      awbResponse;

    const awbCode =
      awbPayload.awb_code ||
      awbPayload.awb ||
      awbResponse.awb_code ||
      null;

    const courierName =
      awbPayload.courier_name ||
      awbPayload.courier ||
      awbResponse.courier_name ||
      null;

    const trackingUrl = extractTrackingUrl(awbResponse);

    if (!awbCode) {
      logger.error("Shiprocket AWB assignment missing awb_code:", awbResponse);
      return errorResponse(
        res,
        awbResponse.message || "Shiprocket did not return an AWB code",
        502
      );
    }

    await query(
      `UPDATE orders
       SET awb_code = ?,
           tracking_number = ?,
           tracking_url = COALESCE(?, tracking_url),
           courier_name = ?,
           shipping_method = COALESCE(?, shipping_method),
           order_status = 'shipped'
       WHERE id = ? AND store_id = ?`,
      [
        awbCode,
        awbCode,
        trackingUrl,
        courierName,
        courierName || "Shiprocket",
        orderId,
        storeId,
      ]
    );

    await query(
      "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'shipped', ?, ?)",
      [
        storeId,
        orderId,
        `Shiprocket AWB assigned. AWB: ${awbCode}${courierName ? ` via ${courierName}` : ""}`,
        req.admin?.id || null,
      ]
    );

    const updated = await query(
      "SELECT * FROM orders WHERE id = ? AND store_id = ?",
      [orderId, storeId]
    );

    return successResponse(
      res,
      {
        order: updated[0],
        shiprocket: {
          awb_code: awbCode,
          courier_name: courierName,
          tracking_url: trackingUrl,
          raw: awbResponse,
        },
      },
      "AWB assigned successfully"
    );
  } catch (error) {
    logger.error("Assign Shiprocket AWB error:", error);
    return errorResponse(
      res,
      error.message || "Failed to assign AWB",
      500
    );
  }
};

const generateShippingLabel = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orderId = req.params.id;

    const rows = await query(
      "SELECT id, shiprocket_shipment_id FROM orders WHERE id = ? AND store_id = ?",
      [orderId, storeId]
    );

    if (!rows.length) return errorResponse(res, "Order not found", 404);
    if (!rows[0].shiprocket_shipment_id) {
      return errorResponse(res, "Shipment not created yet", 400);
    }

    await getShiprocketConfig(storeId);

    const labelRes = await generateShiprocketLabel(
      storeId,
      rows[0].shiprocket_shipment_id
    );

    const labelUrl =
      labelRes.label_url ||
      labelRes.label_created ||
      labelRes.response?.label_url ||
      labelRes.data?.label_url ||
      null;

    await query(
      "UPDATE orders SET shiprocket_label_url = COALESCE(?, shiprocket_label_url) WHERE id = ? AND store_id = ?",
      [labelUrl, orderId, storeId]
    );

    return successResponse(res, { label_url: labelUrl, raw: labelRes }, "Shipping label generated");
  } catch (error) {
    logger.error("Generate Shiprocket label error:", error);
    return errorResponse(res, error.message || "Failed to generate label", 500);
  }
};

const scheduleShiprocketPickup = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const orderId = req.params.id;

    const rows = await query(
      "SELECT id, shiprocket_shipment_id FROM orders WHERE id = ? AND store_id = ?",
      [orderId, storeId]
    );

    if (!rows.length) return errorResponse(res, "Order not found", 404);
    if (!rows[0].shiprocket_shipment_id) {
      return errorResponse(res, "Shipment not created yet", 400);
    }

    await getShiprocketConfig(storeId);

    const pickupRes = await requestShiprocketPickup(
      storeId,
      rows[0].shiprocket_shipment_id
    );

    const pickupToken =
      pickupRes.pickup_token_number ||
      pickupRes.pickup_token ||
      pickupRes.response?.pickup_token_number ||
      null;

    await query(
      `UPDATE orders
       SET shiprocket_pickup_status = 'scheduled',
           shiprocket_pickup_token = COALESCE(?, shiprocket_pickup_token)
       WHERE id = ? AND store_id = ?`,
      [pickupToken, orderId, storeId]
    );

    await query(
      "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, 'pickup_scheduled', ?, ?)",
      [storeId, orderId, "Shiprocket pickup scheduled", req.admin?.id || null]
    );

    return successResponse(res, { pickup_token: pickupToken, raw: pickupRes }, "Pickup scheduled");
  } catch (error) {
    logger.error("Schedule Shiprocket pickup error:", error);
    return errorResponse(res, error.message || "Failed to schedule pickup", 500);
  }
};

module.exports.getOrderStats = getOrderStats;
module.exports.getOrders = getOrders;
module.exports.getOrder = getOrder;
module.exports.createOrder = createOrder;
module.exports.updateOrderStatus = updateOrderStatus;
module.exports.updatePaymentStatus = updatePaymentStatus;
module.exports.addOrderNote = addOrderNote;
module.exports.generateInvoice = generateInvoice;
module.exports.deleteOrder = deleteOrder;
module.exports.createShiprocketShipment = createShiprocketShipment;
module.exports.syncShiprocketTracking = syncShiprocketTracking;
module.exports.exportOrders = exportOrders;
module.exports.generateShippingLabel = generateShippingLabel;
module.exports.scheduleShiprocketPickup = scheduleShiprocketPickup;
module.exports.assignShiprocketAwb = assignShiprocketAwb;
