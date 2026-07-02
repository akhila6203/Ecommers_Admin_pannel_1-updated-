const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  getCouponUsage,
  getAllCouponUsage,
} = require("../controllers/couponController");
const router = express.Router();

router.get("/usage/all", authenticate, authorize("super_admin", "admin", "manager"), getAllCouponUsage);
router.post("/validate", validateCoupon);
// router.post("/validate", authenticate, authorize("super_admin", "admin", "manager"), validateCoupon);
router.get("/", authenticate, authorize("super_admin", "admin", "manager"), getCoupons);
router.get("/:id/usage", authenticate, authorize("super_admin", "admin", "manager"), getCouponUsage);
router.get("/:id", authenticate, authorize("super_admin", "admin", "manager"), getCoupon);
router.post("/", authenticate, authorize("super_admin", "admin"), createCoupon);
router.put("/:id", authenticate, authorize("super_admin", "admin"), updateCoupon);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteCoupon);

module.exports = router;