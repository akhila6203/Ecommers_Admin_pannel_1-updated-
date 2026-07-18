const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const getDashboardStats = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const [aggregates] = await query(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE store_id = ?) AS totalOrders,
        (SELECT COUNT(*) FROM products WHERE store_id = ? AND status = 'active') AS totalProducts,
        (SELECT COUNT(*) FROM categories WHERE store_id = ?) AS totalCategories,
        (SELECT COUNT(*) FROM customers WHERE store_id = ? AND status = 'active') AS totalCustomers,
        (SELECT COUNT(*) FROM banners WHERE store_id = ?) AS totalBanners,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND DATE(created_at) = CURDATE()) AS todayOrders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE store_id = ? AND DATE(created_at) = CURDATE()) AS todayRevenue,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE store_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND order_status = 'delivered') AS monthlyRevenue,
        (SELECT COUNT(*) FROM products WHERE store_id = ? AND stock <= low_stock_threshold AND stock > 0 AND status = 'active') AS lowStock,
        (SELECT COUNT(*) FROM products WHERE store_id = ? AND stock <= 0 AND status = 'active') AS outOfStock
    `, [storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId]);

    const [recentOrders, topProducts, monthlyRevenueData, orderStatusCounts] = await Promise.all([
      query(
        "SELECT id, order_number, customer_id, total_amount, order_status, payment_status, created_at FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 10",
        [storeId]
      ),
      query(
  `SELECT
      p.id,
      p.name,
      COALESCE(
        NULLIF(p.thumbnail, ''),
        (
          SELECT pi.image
          FROM product_images pi
          WHERE pi.product_id = p.id
            AND pi.store_id = p.store_id
          ORDER BY
            CASE
              WHEN pi.image_type = 'thumbnail' THEN 0
              ELSE 1
            END,
            pi.sort_order ASC,
            pi.id ASC
          LIMIT 1
        )
      ) AS thumbnail,
      p.price,
      p.offer_price,
      p.total_sales,
      COALESCE(SUM(oi.quantity), 0) AS total_qty
   FROM products p
   JOIN order_items oi
     ON p.id = oi.product_id
    AND oi.store_id = p.store_id
   JOIN orders o
     ON oi.order_id = o.id
    AND o.store_id = p.store_id
   WHERE p.store_id = ?
     AND o.order_status = 'delivered'
   GROUP BY
      p.id,
      p.name,
      p.thumbnail,
      p.price,
      p.offer_price,
      p.total_sales
   ORDER BY total_qty DESC
   LIMIT 10`,
  [storeId]
),
     
      query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders_count
         FROM orders WHERE store_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND order_status = 'delivered'
         GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month ASC`,
        [storeId]
      ),
      query(
        "SELECT order_status, COUNT(*) as count FROM orders WHERE store_id = ? GROUP BY order_status",
        [storeId]
      ),
    ]);

    return successResponse(res, {
      statistics: {
        totalOrders: aggregates.totalOrders,
        totalProducts: aggregates.totalProducts,
        totalCategories: aggregates.totalCategories,
        totalCustomers: aggregates.totalCustomers,
        totalBanners: aggregates.totalBanners,
        todayOrders: aggregates.todayOrders,
        todayRevenue: parseFloat(aggregates.todayRevenue),
        monthlyRevenue: parseFloat(aggregates.monthlyRevenue),
        lowStock: aggregates.lowStock,
        outOfStock: aggregates.outOfStock,
      },
      recentOrders,
      topProducts,
      revenueAnalytics: monthlyRevenueData,
      orderStatusDistribution: orderStatusCounts,
    });
  } catch (error) {
    logger.error("Dashboard stats error:", error);
    return errorResponse(res, "Failed to fetch dashboard statistics", 500);
  }
};

const getRevenueAnalytics = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const period = req.query.period || "monthly";

    let groupFormat, dateCondition;
    if (period === "daily") {
      groupFormat = "DATE_FORMAT(created_at, '%Y-%m-%d')";
      dateCondition = "created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    } else if (period === "yearly") {
      groupFormat = "DATE_FORMAT(created_at, '%Y')";
      dateCondition = "created_at >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)";
    } else {
      groupFormat = "DATE_FORMAT(created_at, '%Y-%m')";
      dateCondition = "created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)";
    }

    const [revenue, totalRevenue, avgOrderValue] = await Promise.all([
      query(
        `SELECT ${groupFormat} as period, COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders_count FROM orders WHERE store_id = ? AND ${dateCondition} AND order_status = 'delivered' GROUP BY period ORDER BY period ASC`,
        [storeId]
      ),
      query("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE store_id = ? AND order_status = 'delivered'", [storeId]),
      query("SELECT COALESCE(AVG(total_amount), 0) as avg FROM orders WHERE store_id = ? AND order_status = 'delivered'", [storeId]),
    ]);

    return successResponse(res, {
      revenue,
      totalRevenue: parseFloat(totalRevenue[0].total),
      averageOrderValue: parseFloat(avgOrderValue[0].avg),
    });
  } catch (error) {
    logger.error("Revenue analytics error:", error);
    return errorResponse(res, "Failed to fetch revenue analytics", 500);
  }
};

const getSalesAnalytics = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const [todaySales, weekSales, monthSales, salesByCategory] = await Promise.all([
      query("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as orders FROM orders WHERE store_id = ? AND DATE(created_at) = CURDATE()", [storeId]),
      query("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as orders FROM orders WHERE store_id = ? AND WEEK(created_at) = WEEK(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())", [storeId]),
      query("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as orders FROM orders WHERE store_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())", [storeId]),
      query(
        "SELECT c.name, COUNT(oi.id) as total_sales, SUM(oi.total_price) as revenue FROM categories c JOIN products p ON c.id = p.category_id AND p.store_id = c.store_id JOIN order_items oi ON p.id = oi.product_id AND oi.store_id = p.store_id JOIN orders o ON oi.order_id = o.id AND o.store_id = p.store_id WHERE c.store_id = ? AND o.order_status = 'delivered' GROUP BY c.id ORDER BY revenue DESC LIMIT 10",
        [storeId]
      ),
    ]);

    return successResponse(res, {
      today: { sales: parseFloat(todaySales[0].total), orders: todaySales[0].orders },
      thisWeek: { sales: parseFloat(weekSales[0].total), orders: weekSales[0].orders },
      thisMonth: { sales: parseFloat(monthSales[0].total), orders: monthSales[0].orders },
      salesByCategory,
    });
  } catch (error) {
    logger.error("Sales analytics error:", error);
    return errorResponse(res, "Failed to fetch sales analytics", 500);
  }
};

const getOrderAnalytics = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const [statusCounts, paymentStatuses, monthlyOrders] = await Promise.all([
      query("SELECT order_status, COUNT(*) as count FROM orders WHERE store_id = ? GROUP BY order_status", [storeId]),
      query("SELECT payment_status, COUNT(*) as count FROM orders WHERE store_id = ? GROUP BY payment_status", [storeId]),
      query(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as total FROM orders WHERE store_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month ASC",
        [storeId]
      ),
    ]);

    return successResponse(res, {
      orderStatusDistribution: statusCounts,
      paymentStatusDistribution: paymentStatuses,
      monthlyOrders,
    });
  } catch (error) {
    logger.error("Order analytics error:", error);
    return errorResponse(res, "Failed to fetch order analytics", 500);
  }
};

module.exports.getDashboardStats = getDashboardStats;
module.exports.getRevenueAnalytics = getRevenueAnalytics;
module.exports.getSalesAnalytics = getSalesAnalytics;
module.exports.getOrderAnalytics = getOrderAnalytics;



