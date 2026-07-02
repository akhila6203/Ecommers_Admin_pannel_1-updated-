const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getOrders,
  getOrder,
  getOrderStats,
  createOrder,
  updateOrderStatus,
  updatePaymentStatus,
  addOrderNote,
  generateInvoice,
  deleteOrder,
  exportOrders,
  createShiprocketShipment,
  syncShiprocketTracking,
  generateShippingLabel,
  scheduleShiprocketPickup,
  assignShiprocketAwb,
} = require("../controllers/orderController");
const router = express.Router();

router.get("/export", authenticate, authorize("super_admin", "admin", "manager"), exportOrders);
router.get("/stats", authenticate, authorize("super_admin", "admin", "manager", "staff"), getOrderStats);
router.get("/", authenticate, authorize("super_admin", "admin", "manager", "staff"), getOrders);
router.post(
  "/:id/shiprocket/create-shipment",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  createShiprocketShipment
);

router.post(
  "/:id/shiprocket/assign-awb",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  assignShiprocketAwb
);

router.post(
  "/:id/shiprocket/sync-tracking",
  authenticate,
  authorize("super_admin", "admin", "manager", "staff"),
  syncShiprocketTracking
);
router.post(
  "/:id/shiprocket/generate-label",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  generateShippingLabel
);

router.post(
  "/:id/shiprocket/schedule-pickup",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  scheduleShiprocketPickup
);
router.get("/:id", authenticate, authorize("super_admin", "admin", "manager", "staff"), getOrder);
router.post("/", authenticate, authorize("super_admin", "admin", "manager"), createOrder);
router.put("/:id/status", authenticate, authorize("super_admin", "admin", "manager"), updateOrderStatus);
router.put("/:id/payment", authenticate, authorize("super_admin", "admin"), updatePaymentStatus);
router.post("/:id/notes", authenticate, authorize("super_admin", "admin", "manager"), addOrderNote);
router.get("/:id/invoice", authenticate, authorize("super_admin", "admin", "manager"), generateInvoice);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteOrder);

module.exports = router;