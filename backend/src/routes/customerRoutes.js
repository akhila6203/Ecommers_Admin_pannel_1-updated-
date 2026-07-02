const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  blockCustomer,
  deleteCustomer,
  getCustomerAnalytics,
} = require("../controllers/customerController");
const router = express.Router();

router.get("/analytics", authenticate, authorize("super_admin", "admin"), getCustomerAnalytics);
router.get("/", authenticate, authorize("super_admin", "admin", "manager", "staff"), getCustomers);
router.get("/:id", authenticate, authorize("super_admin", "admin", "manager", "staff"), getCustomer);
router.post("/", authenticate, authorize("super_admin", "admin"), createCustomer);
router.put("/:id", authenticate, authorize("super_admin", "admin", "manager"), updateCustomer);
router.put("/:id/block", authenticate, authorize("super_admin", "admin"), blockCustomer);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteCustomer);

module.exports = router;