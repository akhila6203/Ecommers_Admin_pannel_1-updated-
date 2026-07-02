const { query } = require("../config/db");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
// @desc    Sales report
// @route   GET /api/reports/sales
const getSalesReport = async (req, res) => {
  try {
    const { start_date, end_date, group_by } = req.query;
    const groupClause = group_by === "monthly" ? "DATE_FORMAT(o.created_at, '%Y-%m')" :
                        group_by === "yearly" ? "DATE_FORMAT(o.created_at, '%Y')" :
                        "DATE(o.created_at)";

    let whereClause = "WHERE o.store_id = ? AND o.order_status NOT IN ('cancelled', 'returned', 'refunded')";
    const params = [getStoreId(req)];

    if (start_date) { whereClause += " AND o.created_at >= ?"; params.push(start_date); }
    if (end_date) { whereClause += " AND o.created_at <= ?"; params.push(end_date + " 23:59:59"); }

    const data = await query(
      `SELECT ${groupClause} as period,
        COUNT(*) as order_count,
        SUM(o.total_amount) as total_revenue,
        SUM(o.subtotal) as subtotal,
        SUM(o.discount_amount) as total_discount,
        SUM(o.shipping_charge) as total_shipping,
        SUM(o.tax_amount) as total_tax,
        AVG(o.total_amount) as average_order_value
       FROM orders o
       ${whereClause}
       GROUP BY period
       ORDER BY period DESC
       LIMIT 365`,
      params
    );

    // Summary
    const [summary] = await query(
      `SELECT COUNT(*) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value
       FROM orders o ${whereClause}`,
      params
    );

    return successResponse(res, { data, summary: summary[0] });
  } catch (error) {
    logger.error("Sales report error:", error);
    return errorResponse(res, "Failed to generate sales report", 500);
  }
};

// @desc    Order report
// @route   GET /api/reports/orders
const getOrderReport = async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    let whereClause = "WHERE o.store_id = ?";
    const params = [getStoreId(req)];

    if (start_date) { whereClause += " AND o.created_at >= ?"; params.push(start_date); }
    if (end_date) { whereClause += " AND o.created_at <= ?"; params.push(end_date + " 23:59:59"); }
    if (status) { whereClause += " AND o.order_status = ?"; params.push(status); }

    const orders = await query(
      `SELECT o.order_number, o.order_status, o.payment_status, o.total_amount, o.paid_amount,
        o.shipping_name, o.shipping_city, o.payment_method, o.created_at,
        CONCAT(c.first_name, ' ', c.last_name) as customer_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id AND c.store_id = o.store_id
       ${whereClause}
       ORDER BY o.created_at DESC`,
      params
    );

    return successResponse(res, orders);
  } catch (error) {
    logger.error("Order report error:", error);
    return errorResponse(res, "Failed to generate order report", 500);
  }
};

// @desc    Customer report
// @route   GET /api/reports/customers
const getCustomerReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let whereClause = "WHERE c.store_id = ?";
    const params = [getStoreId(req)];

    if (start_date) { whereClause += " AND c.created_at >= ?"; params.push(start_date); }
    if (end_date) { whereClause += " AND c.created_at <= ?"; params.push(end_date + " 23:59:59"); }

    const customers = await query(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.status, c.created_at,
        c.total_orders, c.total_spent, c.last_login_at,
        (SELECT COUNT(*) FROM reviews WHERE customer_id = c.id AND store_id = c.store_id) as review_count
       FROM customers c
       ${whereClause}
       ORDER BY c.total_spent DESC`,
      params
    );

    const [summary] = await query(
      `SELECT COUNT(*) as total_customers,
        COALESCE(SUM(total_orders), 0) as total_orders,
        COALESCE(SUM(total_spent), 0) as total_revenue
       FROM customers c ${whereClause}`,
      params
    );

    return successResponse(res, { data: customers, summary: summary[0] });
  } catch (error) {
    logger.error("Customer report error:", error);
    return errorResponse(res, "Failed to generate customer report", 500);
  }
};

// @desc    Product report
// @route   GET /api/reports/products
const getProductReport = async (req, res) => {
  try {
    const { category_id, stock_status } = req.query;
    let whereClause = "WHERE p.store_id = ?";
    const params = [getStoreId(req)];

    if (category_id) { whereClause += " AND p.category_id = ?"; params.push(category_id); }
    if (stock_status) { whereClause += " AND p.stock_status = ?"; params.push(stock_status); }

    const products = await query(
      `SELECT p.id, p.name, p.sku, p.price, p.offer_price, p.stock, p.stock_status,
        p.total_sales, p.avg_rating, p.review_count, p.status,
        c.name as category_name,
        (p.price - p.offer_price) as profit_margin
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.store_id = p.store_id
       ${whereClause}
       ORDER BY p.total_sales DESC`,
      params
    );

    const [summary] = await query(
      `SELECT COUNT(*) as total_products,
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(AVG(avg_rating), 0) as avg_rating
       FROM products p ${whereClause}`,
      params
    );

    return successResponse(res, { data: products, summary: summary[0] });
  } catch (error) {
    logger.error("Product report error:", error);
    return errorResponse(res, "Failed to generate product report", 500);
  }
};

// @desc    Inventory report
// @route   GET /api/reports/inventory
const getInventoryReport = async (req, res) => {
  try {
    const { stock_status } = req.query;
    let whereClause = "WHERE p.store_id = ?";
    const params = [getStoreId(req)];

    if (stock_status === "low") whereClause += " AND p.stock_status = 'low_stock'";
    else if (stock_status === "out") whereClause += " AND p.stock_status = 'out_of_stock'";
    else if (stock_status === "in") whereClause += " AND p.stock_status = 'in_stock'";

    const inventory = await query(
      `SELECT p.id, p.name, p.sku, p.stock, p.stock_status, p.low_stock_threshold, p.price,
        i.quantity, i.reserved_quantity, i.available_quantity,
        (i.quantity - i.available_quantity) as reserved
       FROM products p
       LEFT JOIN inventory i ON p.id = i.product_id AND i.store_id = p.store_id
       ${whereClause}
       ORDER BY p.stock ASC`,
      params
    );

    const [summary] = await query(
      `SELECT COUNT(*) as total_products,
        COALESCE(SUM(stock), 0) as total_stock,
        SUM(CASE WHEN stock_status = 'low_stock' THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN stock_status = 'out_of_stock' THEN 1 ELSE 0 END) as out_of_stock_count
       FROM products p ${whereClause}`,
      params
    );

    return successResponse(res, { data: inventory, summary: summary[0] });
  } catch (error) {
    logger.error("Inventory report error:", error);
    return errorResponse(res, "Failed to generate inventory report", 500);
  }
};

// @desc    GST report
// @route   GET /api/reports/gst
const getGstReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let whereClause = "WHERE o.store_id = ? AND o.order_status = 'delivered'";
    const params = [getStoreId(req)];

    if (start_date) { whereClause += " AND o.created_at >= ?"; params.push(start_date); }
    if (end_date) { whereClause += " AND o.created_at <= ?"; params.push(end_date + " 23:59:59"); }

    const data = await query(
      `SELECT o.order_number, o.order_status, o.created_at, o.total_amount, o.gst_amount, o.invoice_number,
        oi.product_name, oi.quantity, oi.price, oi.gst_percent, oi.gst_amount as item_gst
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id AND oi.store_id = o.store_id
       ${whereClause}
       ORDER BY o.created_at DESC`,
      params
    );

    const [summary] = await query(
      `SELECT COUNT(DISTINCT o.id) as total_invoices,
        COALESCE(SUM(o.gst_amount), 0) as total_gst,
        COALESCE(SUM(o.total_amount), 0) as total_taxable_value
       FROM orders o ${whereClause}`,
      params
    );

    return successResponse(res, { data, summary: summary[0] });
  } catch (error) {
    logger.error("GST report error:", error);
    return errorResponse(res, "Failed to generate GST report", 500);
  }
};

// @desc    Get report summary / dashboard export
// @route   GET /api/reports/summary
const getReportSummary = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const today = new Date().toISOString().split("T")[0];

    const [todaySales] = await query(
      "SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE store_id = ? AND DATE(created_at) = ? AND order_status NOT IN ('cancelled', 'returned', 'refunded')",
      [storeId, today]
    );

    const [totalStats] = await query(
      "SELECT (SELECT COUNT(*) FROM orders WHERE store_id = ?) as total_orders, (SELECT COUNT(*) FROM products WHERE store_id = ?) as total_products, (SELECT COUNT(*) FROM customers WHERE store_id = ?) as total_customers, (SELECT COUNT(*) FROM reviews WHERE store_id = ? AND status = 'pending') as pending_reviews",
      [storeId, storeId, storeId, storeId]
    );

    return successResponse(res, {
      today: todaySales[0],
      totals: totalStats[0],
    });
  } catch (error) {
    logger.error("Report summary error:", error);
    return errorResponse(res, "Failed to generate summary", 500);
  }
};

module.exports.getSalesReport = getSalesReport;
module.exports.getOrderReport = getOrderReport;
module.exports.getCustomerReport = getCustomerReport;
module.exports.getProductReport = getProductReport;
module.exports.getInventoryReport = getInventoryReport;
module.exports.getGstReport = getGstReport;
module.exports.getReportSummary = getReportSummary;
