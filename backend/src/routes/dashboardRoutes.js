const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getDashboardStats,
  getRevenueAnalytics,
  getSalesAnalytics,
  getOrderAnalytics,
} = require("../controllers/dashboardController");
const router = express.Router();

router.get("/stats", authenticate, authorize("super_admin", "admin", "manager"), getDashboardStats);
router.get("/revenue", authenticate, authorize("super_admin", "admin"), getRevenueAnalytics);
router.get("/sales", authenticate, authorize("super_admin", "admin", "manager"), getSalesAnalytics);
router.get("/orders", authenticate, authorize("super_admin", "admin", "manager"), getOrderAnalytics);

module.exports = router;