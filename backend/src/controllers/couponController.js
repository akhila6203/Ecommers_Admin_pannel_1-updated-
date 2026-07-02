const { query } = require("../config/db");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const COUPON_COLUMNS =
  "id, code, type, value, minimum_order_amount, maximum_discount, usage_limit, used_count, per_user_limit, is_for_new_customers, start_date, expiry_date, status, description, created_at, updated_at";

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

const getCoupons = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";

    let whereClause = "WHERE c.store_id = ?";
    const params = [storeId];
    if (search) {
      whereClause += " AND c.code LIKE ?";
      params.push(`%${search}%`);
    }
    if (status) {
      whereClause += " AND c.status = ?";
      params.push(status);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM coupons c ${whereClause}`, params);
    const total = countResult[0].total;

    const coupons = await query(
      `SELECT ${COUPON_COLUMNS} FROM coupons c ${whereClause} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );
    return paginatedResponse(res, coupons, total, page, limit);
  } catch (error) {
    logger.error("Get coupons error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch coupons", 500);
  }
};

const getCoupon = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const coupons = await query(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE id = ? AND store_id = ?`, [req.params.id, storeId]);
    if (!coupons.length) return errorResponse(res, "Coupon not found", 404);
    return successResponse(res, coupons[0]);
  } catch (error) {
    logger.error("Get coupon error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch coupon", 500);
  }
};

const createCoupon = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const {
      code, type, value, minimum_order_amount, maximum_discount,
      usage_limit, per_user_limit, is_for_new_customers,
      start_date, expiry_date, status, description,
    } = req.body;

    if (!code?.trim()) return errorResponse(res, "Coupon code is required", 400);
    if (value === undefined || value === null || isNaN(value)) {
      return errorResponse(res, "Valid discount value is required", 400);
    }

    const existing = await query("SELECT id FROM coupons WHERE code = ? AND store_id = ?", [code.toUpperCase(), storeId]);
    if (existing.length) return errorResponse(res, "Coupon code already exists", 409);

    const result = await query(
      `INSERT INTO coupons (store_id, code, type, value, minimum_order_amount, maximum_discount, usage_limit, used_count, per_user_limit, is_for_new_customers, start_date, expiry_date, status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        code.toUpperCase(),
        type || "percentage",
        value,
        minimum_order_amount || 0,
        maximum_discount || 0,
        usage_limit || 0,
        per_user_limit ?? 1,
        is_for_new_customers || 0,
        start_date || null,
        expiry_date || null,
        status || "active",
        description || null,
      ]
    );
    const coupon = await query(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE id = ? AND store_id = ?`, [result.insertId, storeId]);
    return successResponse(res, coupon[0], "Coupon created successfully", 201);
  } catch (error) {
    logger.error("Create coupon error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to create coupon", 500);
  }
};

const updateCoupon = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const {
      code, type, value, minimum_order_amount, maximum_discount,
      usage_limit, per_user_limit, is_for_new_customers,
      start_date, expiry_date, status, description,
    } = req.body;

    const existing = await query(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE id = ? AND store_id = ?`, [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Coupon not found", 404);

    const nextCode = code ? code.toUpperCase() : existing[0].code;
    if (nextCode !== existing[0].code) {
      const dup = await query("SELECT id FROM coupons WHERE code = ? AND store_id = ? AND id != ?", [nextCode, storeId, req.params.id]);
      if (dup.length) return errorResponse(res, "Coupon code already exists", 409);
    }

    await query(
      `UPDATE coupons SET
        code = ?, type = ?, value = ?, minimum_order_amount = ?, maximum_discount = ?,
        usage_limit = ?, per_user_limit = ?, is_for_new_customers = ?,
        start_date = ?, expiry_date = ?, status = ?, description = ?
       WHERE id = ? AND store_id = ?`,
      [
        nextCode,
        type ?? existing[0].type,
        value !== undefined && value !== null ? value : existing[0].value,
        minimum_order_amount !== undefined ? minimum_order_amount : existing[0].minimum_order_amount,
        maximum_discount !== undefined ? maximum_discount : existing[0].maximum_discount,
        usage_limit !== undefined ? usage_limit : existing[0].usage_limit,
        per_user_limit !== undefined ? per_user_limit : existing[0].per_user_limit,
        is_for_new_customers !== undefined ? is_for_new_customers : existing[0].is_for_new_customers,
        start_date !== undefined ? (start_date || null) : existing[0].start_date,
        expiry_date !== undefined ? (expiry_date || null) : existing[0].expiry_date,
        status ?? existing[0].status,
        description !== undefined ? description : existing[0].description,
        req.params.id,
        storeId,
      ]
    );

    const coupon = await query(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE id = ? AND store_id = ?`, [req.params.id, storeId]);
    return successResponse(res, coupon[0], "Coupon updated successfully");
  } catch (error) {
    logger.error("Update coupon error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to update coupon", 500);
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM coupons WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Coupon not found", 404);

    await query("DELETE FROM coupons WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Coupon deleted");
  } catch (error) {
    logger.error("Delete coupon error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to delete coupon", 500);
  }
};

const validateCoupon = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const code = req.body.code;
    const order_amount = req.body.order_amount ?? req.body.orderTotal ?? req.body.order_total;

    if (!code?.trim()) return errorResponse(res, "Coupon code is required", 400);
    if (!order_amount || isNaN(order_amount)) return errorResponse(res, "Valid order amount is required", 400);

    const coupons = await query(
      `SELECT ${COUPON_COLUMNS} FROM coupons
       WHERE store_id = ? AND code = ? AND status = 'active'
       AND (expiry_date IS NULL OR expiry_date >= CURDATE())
       AND (start_date IS NULL OR start_date <= CURDATE())`,
      [storeId, code.toUpperCase()]
    );
    if (!coupons.length) return errorResponse(res, "Invalid or expired coupon", 400);

    const coupon = coupons[0];
    if (coupon.minimum_order_amount && parseFloat(order_amount) < parseFloat(coupon.minimum_order_amount)) {
      return errorResponse(res, `Minimum order amount is ₹${coupon.minimum_order_amount}`, 400);
    }
    if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
      return errorResponse(res, "Coupon usage limit reached", 400);
    }

    const orderAmount = parseFloat(order_amount) || 0;
    const discountAmount = Math.min(calculateDiscount(coupon, orderAmount), orderAmount);
    const finalAmount = Math.max(0, orderAmount - discountAmount);

    return successResponse(
      res,
      {
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: parseFloat(coupon.value),
          minimum_order_amount: parseFloat(coupon.minimum_order_amount || 0),
          maximum_discount: parseFloat(coupon.maximum_discount || 0),
        },
        discount_amount: discountAmount,
        final_amount: finalAmount,
      },
      "Coupon is valid"
    );
  } catch (error) {
    logger.error("Validate coupon error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to validate coupon", 500);
  }
};

const getCouponUsage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const couponId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const coupon = await query("SELECT id, code FROM coupons WHERE id = ? AND store_id = ?", [couponId, storeId]);
    if (!coupon.length) return errorResponse(res, "Coupon not found", 404);

    const countResult = await query(
      "SELECT COUNT(*) as total FROM coupon_usage WHERE coupon_id = ? AND store_id = ?",
      [couponId, storeId]
    );
    const total = countResult[0].total;

    const usage = await query(
      `SELECT cu.id, cu.coupon_id, cu.order_id, cu.discount_amount, cu.used_at,
        c.code as coupon_code,
        cust.first_name, cust.last_name, cust.email as user_email,
        o.order_number
       FROM coupon_usage cu
       JOIN coupons c ON cu.coupon_id = c.id AND c.store_id = ?
       LEFT JOIN customers cust ON cu.customer_id = cust.id AND cust.store_id = ?
       LEFT JOIN orders o ON cu.order_id = o.id AND o.store_id = ?
       WHERE cu.coupon_id = ? AND cu.store_id = ?
       ORDER BY cu.used_at DESC
       LIMIT ? OFFSET ?`,
      [storeId, storeId, storeId, couponId, storeId, String(limit), String(offset)]
    );

    const rows = usage.map((row) => ({
      id: row.id,
      user_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Guest",
      user_email: row.user_email || "—",
      coupon_code: row.coupon_code,
      discount: row.discount_amount,
      order_id: row.order_id,
      order_number: row.order_number,
      date_used: row.used_at,
    }));

    return paginatedResponse(res, rows, total, page, limit);
  } catch (error) {
    logger.error("Get coupon usage error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch coupon usage", 500);
  }
};

const getAllCouponUsage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const countResult = await query("SELECT COUNT(*) as total FROM coupon_usage WHERE store_id = ?", [storeId]);
    const total = countResult[0].total;

    const usage = await query(
      `SELECT cu.id, cu.coupon_id, cu.order_id, cu.discount_amount, cu.used_at,
        c.code as coupon_code,
        cust.first_name, cust.last_name, cust.email as user_email,
        o.order_number
       FROM coupon_usage cu
       JOIN coupons c ON cu.coupon_id = c.id AND c.store_id = ?
       LEFT JOIN customers cust ON cu.customer_id = cust.id AND cust.store_id = ?
       LEFT JOIN orders o ON cu.order_id = o.id AND o.store_id = ?
       WHERE cu.store_id = ?
       ORDER BY cu.used_at DESC
       LIMIT ? OFFSET ?`,
      [storeId, storeId, storeId, storeId, String(limit), String(offset)]
    );

    const rows = usage.map((row) => ({
      id: row.id,
      user_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Guest",
      user_email: row.user_email || "—",
      coupon_code: row.coupon_code,
      discount: row.discount_amount,
      order_id: row.order_id,
      order_number: row.order_number,
      date_used: row.used_at,
    }));

    return paginatedResponse(res, rows, total, page, limit);
  } catch (error) {
    logger.error("Get all coupon usage error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch coupon usage", 500);
  }
};

const recordCouponUsage = async (connection, { couponCode, customerId, orderId, discountAmount, storeId = 1 }) => {
  if (!couponCode) return;

  const [coupons] = await connection.query(
    "SELECT id FROM coupons WHERE code = ? AND store_id = ?",
    [couponCode.toUpperCase(), storeId]
  );
  if (!coupons.length) return;

  const couponId = coupons[0].id;
  await connection.query(
    "INSERT INTO coupon_usage (store_id, coupon_id, customer_id, order_id, discount_amount) VALUES (?, ?, ?, ?, ?)",
    [storeId, couponId, customerId || null, orderId || null, discountAmount || 0]
  );
  await connection.query(
    "UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND store_id = ?",
    [couponId, storeId]
  );
};

module.exports.getCoupons = getCoupons;
module.exports.getCoupon = getCoupon;
module.exports.createCoupon = createCoupon;
module.exports.updateCoupon = updateCoupon;
module.exports.deleteCoupon = deleteCoupon;
module.exports.validateCoupon = validateCoupon;
module.exports.getCouponUsage = getCouponUsage;
module.exports.getAllCouponUsage = getAllCouponUsage;
module.exports.recordCouponUsage = recordCouponUsage;
