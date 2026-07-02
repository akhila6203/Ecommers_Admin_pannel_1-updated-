const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getSalesReport, getOrderReport, getCustomerReport,
  getProductReport, getInventoryReport, getGstReport, getReportSummary,
} = require("../controllers/reportController");
const router = express.Router();

router.get("/summary", authenticate, authorize("super_admin", "admin"), getReportSummary);
router.get("/sales", authenticate, authorize("super_admin", "admin", "manager"), getSalesReport);
router.get("/orders", authenticate, authorize("super_admin", "admin", "manager"), getOrderReport);
router.get("/customers", authenticate, authorize("super_admin", "admin", "manager"), getCustomerReport);
router.get("/products", authenticate, authorize("super_admin", "admin", "manager"), getProductReport);
router.get("/inventory", authenticate, authorize("super_admin", "admin", "manager"), getInventoryReport);
router.get("/gst", authenticate, authorize("super_admin", "admin"), getGstReport);

module.exports = router;