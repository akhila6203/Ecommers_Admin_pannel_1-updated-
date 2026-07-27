const { query } = require("../config/db");
const { hashPassword } = require("../helpers/passwordHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const getCustomers = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";
    const sort = req.query.sort || "created_at";
    const order = req.query.order || "DESC";

    let whereClause = "WHERE c.store_id = ?";
    const params = [storeId];

    if (search) {
      whereClause += " AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { whereClause += " AND c.status = ?"; params.push(status); }

    const allowedSorts = ["created_at", "first_name", "last_name", "email", "total_orders", "total_spent"];
    const sortColumn = allowedSorts.includes(sort) ? `c.${sort}` : "c.created_at";
    const sortOrder = order === "ASC" ? "ASC" : "DESC";

    const countResult = await query(`SELECT COUNT(*) as total FROM customers c ${whereClause}`, params);
    const total = countResult[0].total;

    const customers = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND store_id = ?) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = c.id AND store_id = ? AND order_status != 'cancelled') as total_spent_amount,
        (SELECT COUNT(*) FROM cart WHERE customer_id = c.id AND store_id = ?) as cart_count,
        (SELECT COUNT(*) FROM wishlists WHERE customer_id = c.id AND store_id = ?) as wishlist_count
       FROM customers c ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [storeId, storeId, storeId, storeId, ...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, customers, total, page, limit);
  } catch (error) {
    logger.error("Get customers error:", error);
    return errorResponse(res, "Failed to fetch customers", 500);
  }
};

const getCustomer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customers = await query("SELECT * FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!customers.length) return errorResponse(res, "Customer not found", 404);

    const customer = customers[0];
    customer.addresses = await query("SELECT * FROM customer_addresses WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
    customer.orders = await query("SELECT id, order_number, total_amount, order_status, payment_status, created_at FROM orders WHERE customer_id = ? AND store_id = ? ORDER BY created_at DESC", [customer.id, storeId]);
    customer.reviews = await query("SELECT r.*, p.name as product_name FROM reviews r JOIN products p ON r.product_id = p.id AND p.store_id = r.store_id WHERE r.customer_id = ? AND r.store_id = ? ORDER BY r.created_at DESC", [customer.id, storeId]);

    customer.cart_items = await query(
      `SELECT c.id, c.product_id, c.quantity, c.selected_size, c.selected_color, c.item_price, c.created_at,
              p.name AS product_name, p.thumbnail, p.price, p.offer_price
       FROM cart c
       JOIN products p ON p.id = c.product_id AND p.store_id = c.store_id
       WHERE c.customer_id = ? AND c.store_id = ?
       ORDER BY c.updated_at DESC`,
      [customer.id, storeId]
    );

    customer.wishlist_items = await query(
      `SELECT w.id, w.product_id, w.created_at,
              p.name AS product_name, p.thumbnail, p.price, p.offer_price
       FROM wishlists w
       JOIN products p ON p.id = w.product_id AND p.store_id = w.store_id
       WHERE w.customer_id = ? AND w.store_id = ?
       ORDER BY w.created_at DESC`,
      [customer.id, storeId]
    );

    const cartCountRows = await query("SELECT COUNT(*) as count FROM cart WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
    const wishlistCountRows = await query("SELECT COUNT(*) as count FROM wishlists WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
    customer.cart_count = cartCountRows[0].count;
    customer.wishlist_count = wishlistCountRows[0].count;

    return successResponse(res, customer);
  } catch (error) {
    logger.error("Get customer error:", error);
    return errorResponse(res, "Failed to fetch customer", 500);
  }
};

const createCustomer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { first_name, last_name, email, password, phone, gender, date_of_birth } = req.body;
    const existing = await query("SELECT id FROM customers WHERE email = ? AND store_id = ?", [email, storeId]);
    if (existing.length) return errorResponse(res, "Email already registered", 409);

    const hashedPassword = await hashPassword(password);
    const result = await query(
      "INSERT INTO customers (store_id, first_name, last_name, email, password, phone, gender, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [storeId, first_name, last_name, email, hashedPassword, phone || null, gender || null, date_of_birth || null]
    );

    const customer = await query("SELECT id, first_name, last_name, email, phone FROM customers WHERE id = ? AND store_id = ?", [result.insertId, storeId]);
    return successResponse(res, customer[0], "Customer created successfully", 201);
  } catch (error) {
    logger.error("Create customer error:", error);
    return errorResponse(res, "Failed to create customer", 500);
  }
};

const updateCustomer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { first_name, last_name, phone, gender, date_of_birth, status, notes } = req.body;
    await query(
      "UPDATE customers SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone), gender = COALESCE(?, gender), date_of_birth = COALESCE(?, date_of_birth), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ? AND store_id = ?",
      [first_name, last_name, phone, gender, date_of_birth, status, notes, req.params.id, storeId]
    );
    return successResponse(res, null, "Customer updated successfully");
  } catch (error) {
    logger.error("Update customer error:", error);
    return errorResponse(res, "Failed to update customer", 500);
  }
};

const blockCustomer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customers = await query("SELECT id, status FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!customers.length) return errorResponse(res, "Customer not found", 404);
    const newStatus = customers[0].status === "blocked" ? "active" : "blocked";
    await query("UPDATE customers SET status = ? WHERE id = ? AND store_id = ?", [newStatus, req.params.id, storeId]);
    return successResponse(res, { status: newStatus }, `Customer ${newStatus === "blocked" ? "blocked" : "unblocked"} successfully`);
  } catch (error) {
    logger.error("Block customer error:", error);
    return errorResponse(res, "Failed to update customer status", 500);
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    await query("DELETE FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Customer deleted");
  } catch (error) {
    logger.error("Delete customer error:", error);
    return errorResponse(res, "Failed to delete customer", 500);
  }
};

const getCustomerAnalytics = async (req, res) => {
  try {
    const storeId = getStoreId(req);

    const totalRows = await query(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE store_id = ?`,
      [storeId]
    );

    const activeRows = await query(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE store_id = ?
         AND status = 'active'`,
      [storeId]
    );

    const blockedRows = await query(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE store_id = ?
         AND status = 'blocked'`,
      [storeId]
    );

    const newThisMonthRows = await query(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE store_id = ?
         AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND created_at < DATE_ADD(
           DATE_FORMAT(CURDATE(), '%Y-%m-01'),
           INTERVAL 1 MONTH
         )`,
      [storeId]
    );

    const monthlyData = await query(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m') AS month,
         COUNT(*) AS count
       FROM customers
       WHERE store_id = ?
         AND created_at >= DATE_SUB(
           DATE_FORMAT(CURDATE(), '%Y-%m-01'),
           INTERVAL 11 MONTH
         )
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month ASC`,
      [storeId]
    );

    return successResponse(res, {
      total: Number(totalRows[0]?.total || 0),
      active: Number(activeRows[0]?.total || 0),
      blocked: Number(blockedRows[0]?.total || 0),
      newThisMonth: Number(
        newThisMonthRows[0]?.total || 0
      ),
      monthlyGrowth: monthlyData || [],
    });
  } catch (error) {
    logger.error("Customer analytics error:", {
      message: error.message,
      sqlMessage: error.sqlMessage,
      stack: error.stack,
    });

    return errorResponse(
      res,
      error.sqlMessage ||
        error.message ||
        "Failed to fetch analytics",
      500
    );
  }
};
// const getCustomerAnalytics = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const [total] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ?", [storeId]);
//     const [active] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND status = 'active'", [storeId]);
//     const [blocked] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND status = 'blocked'", [storeId]);
//     const [newThisMonth] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())", [storeId]);
//     const [monthlyData] = await query(
//       "SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM customers WHERE store_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month",
//       [storeId]
//     );

//     return successResponse(res, {
//       total: total[0].total,
//       active: active[0].total,
//       blocked: blocked[0].total,
//       newThisMonth: newThisMonth[0].total,
//       monthlyGrowth: monthlyData,
//     });
//   } catch (error) {
//     logger.error("Customer analytics error:", error);
//     return errorResponse(res, "Failed to fetch analytics", 500);
//   }
// };

module.exports.getCustomers = getCustomers;
module.exports.getCustomer = getCustomer;
module.exports.createCustomer = createCustomer;
module.exports.updateCustomer = updateCustomer;
module.exports.blockCustomer = blockCustomer;
module.exports.deleteCustomer = deleteCustomer;
module.exports.getCustomerAnalytics = getCustomerAnalytics;





// const { query } = require("../config/db");
// const { hashPassword } = require("../helpers/passwordHelper");
// const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
// const { getStoreId } = require("../helpers/storeHelper");
// const logger = require("../config/logger");
// const getCustomers = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const offset = (page - 1) * limit;
//     const search = req.query.search || "";
//     const status = req.query.status || "";
//     const sort = req.query.sort || "created_at";
//     const order = req.query.order || "DESC";

//     let whereClause = "WHERE c.store_id = ?";
//     const params = [storeId];

//     if (search) {
//       whereClause += " AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)";
//       params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
//     }
//     if (status) { whereClause += " AND c.status = ?"; params.push(status); }

//     const allowedSorts = ["created_at", "first_name", "last_name", "email", "total_orders", "total_spent"];
//     const sortColumn = allowedSorts.includes(sort) ? `c.${sort}` : "c.created_at";
//     const sortOrder = order === "ASC" ? "ASC" : "DESC";

//     const countResult = await query(`SELECT COUNT(*) as total FROM customers c ${whereClause}`, params);
//     const total = countResult[0].total;

//     const customers = await query(
//       `SELECT c.*,
//         (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND store_id = ?) as order_count,
//         (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = c.id AND store_id = ? AND order_status != 'cancelled') as total_spent_amount,
//         (SELECT COUNT(*) FROM cart WHERE customer_id = c.id AND store_id = ?) as cart_count,
//         (SELECT COUNT(*) FROM wishlists WHERE customer_id = c.id AND store_id = ?) as wishlist_count
//        FROM customers c ${whereClause}
//        ORDER BY ${sortColumn} ${sortOrder}
//        LIMIT ? OFFSET ?`,
//       [storeId, storeId, storeId, storeId, ...params, String(limit), String(offset)]
//     );

//     return paginatedResponse(res, customers, total, page, limit);
//   } catch (error) {
//     logger.error("Get customers error:", error);
//     return errorResponse(res, "Failed to fetch customers", 500);
//   }
// };

// const getCustomer = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const customers = await query("SELECT * FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
//     if (!customers.length) return errorResponse(res, "Customer not found", 404);

//     const customer = customers[0];
//     customer.addresses = await query("SELECT * FROM customer_addresses WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
//     customer.orders = await query("SELECT id, order_number, total_amount, order_status, payment_status, created_at FROM orders WHERE customer_id = ? AND store_id = ? ORDER BY created_at DESC", [customer.id, storeId]);
//     customer.reviews = await query("SELECT r.*, p.name as product_name FROM reviews r JOIN products p ON r.product_id = p.id AND p.store_id = r.store_id WHERE r.customer_id = ? AND r.store_id = ? ORDER BY r.created_at DESC", [customer.id, storeId]);

//     customer.cart_items = await query(
//       `SELECT c.id, c.product_id, c.quantity, c.selected_size, c.selected_color, c.item_price, c.created_at,
//               p.name AS product_name, p.thumbnail, p.price, p.offer_price
//        FROM cart c
//        JOIN products p ON p.id = c.product_id AND p.store_id = c.store_id
//        WHERE c.customer_id = ? AND c.store_id = ?
//        ORDER BY c.updated_at DESC`,
//       [customer.id, storeId]
//     );

//     customer.wishlist_items = await query(
//       `SELECT w.id, w.product_id, w.created_at,
//               p.name AS product_name, p.thumbnail, p.price, p.offer_price
//        FROM wishlists w
//        JOIN products p ON p.id = w.product_id AND p.store_id = w.store_id
//        WHERE w.customer_id = ? AND w.store_id = ?
//        ORDER BY w.created_at DESC`,
//       [customer.id, storeId]
//     );

//     const cartCountRows = await query("SELECT COUNT(*) as count FROM cart WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
//     const wishlistCountRows = await query("SELECT COUNT(*) as count FROM wishlists WHERE customer_id = ? AND store_id = ?", [customer.id, storeId]);
//     customer.cart_count = cartCountRows[0].count;
//     customer.wishlist_count = wishlistCountRows[0].count;

//     return successResponse(res, customer);
//   } catch (error) {
//     logger.error("Get customer error:", error);
//     return errorResponse(res, "Failed to fetch customer", 500);
//   }
// };

// const createCustomer = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const { first_name, last_name, email, password, phone, gender, date_of_birth } = req.body;
//     const existing = await query("SELECT id FROM customers WHERE email = ? AND store_id = ?", [email, storeId]);
//     if (existing.length) return errorResponse(res, "Email already registered", 409);

//     const hashedPassword = await hashPassword(password);
//     const result = await query(
//       "INSERT INTO customers (store_id, first_name, last_name, email, password, phone, gender, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
//       [storeId, first_name, last_name, email, hashedPassword, phone || null, gender || null, date_of_birth || null]
//     );

//     const customer = await query("SELECT id, first_name, last_name, email, phone FROM customers WHERE id = ? AND store_id = ?", [result.insertId, storeId]);
//     return successResponse(res, customer[0], "Customer created successfully", 201);
//   } catch (error) {
//     logger.error("Create customer error:", error);
//     return errorResponse(res, "Failed to create customer", 500);
//   }
// };

// const updateCustomer = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const { first_name, last_name, phone, gender, date_of_birth, status, notes } = req.body;
//     await query(
//       "UPDATE customers SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone), gender = COALESCE(?, gender), date_of_birth = COALESCE(?, date_of_birth), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ? AND store_id = ?",
//       [first_name, last_name, phone, gender, date_of_birth, status, notes, req.params.id, storeId]
//     );
//     return successResponse(res, null, "Customer updated successfully");
//   } catch (error) {
//     logger.error("Update customer error:", error);
//     return errorResponse(res, "Failed to update customer", 500);
//   }
// };

// const blockCustomer = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const customers = await query("SELECT id, status FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
//     if (!customers.length) return errorResponse(res, "Customer not found", 404);
//     const newStatus = customers[0].status === "blocked" ? "active" : "blocked";
//     await query("UPDATE customers SET status = ? WHERE id = ? AND store_id = ?", [newStatus, req.params.id, storeId]);
//     return successResponse(res, { status: newStatus }, `Customer ${newStatus === "blocked" ? "blocked" : "unblocked"} successfully`);
//   } catch (error) {
//     logger.error("Block customer error:", error);
//     return errorResponse(res, "Failed to update customer status", 500);
//   }
// };

// const deleteCustomer = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     await query("DELETE FROM customers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
//     return successResponse(res, null, "Customer deleted");
//   } catch (error) {
//     logger.error("Delete customer error:", error);
//     return errorResponse(res, "Failed to delete customer", 500);
//   }
// };

// const getCustomerAnalytics = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const [total] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ?", [storeId]);
//     const [active] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND status = 'active'", [storeId]);
//     const [blocked] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND status = 'blocked'", [storeId]);
//     const [newThisMonth] = await query("SELECT COUNT(*) as total FROM customers WHERE store_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())", [storeId]);
//     const [monthlyData] = await query(
//       "SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM customers WHERE store_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month",
//       [storeId]
//     );

//     return successResponse(res, {
//       total: total[0].total,
//       active: active[0].total,
//       blocked: blocked[0].total,
//       newThisMonth: newThisMonth[0].total,
//       monthlyGrowth: monthlyData,
//     });
//   } catch (error) {
//     logger.error("Customer analytics error:", error);
//     return errorResponse(res, "Failed to fetch analytics", 500);
//   }
// };

// module.exports.getCustomers = getCustomers;
// module.exports.getCustomer = getCustomer;
// module.exports.createCustomer = createCustomer;
// module.exports.updateCustomer = updateCustomer;
// module.exports.blockCustomer = blockCustomer;
// module.exports.deleteCustomer = deleteCustomer;
// module.exports.getCustomerAnalytics = getCustomerAnalytics;
