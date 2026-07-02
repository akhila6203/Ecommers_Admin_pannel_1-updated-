const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { getOffers, getOffer, createOffer, updateOffer, deleteOffer, getOfferAnalytics } = require("../controllers/offerController");
const router = express.Router();

router.get("/analytics", authenticate, authorize("super_admin", "admin"), getOfferAnalytics);
router.get("/", authenticate, authorize("super_admin", "admin", "manager"), getOffers);
router.get("/:id", authenticate, authorize("super_admin", "admin", "manager"), getOffer);
router.post("/", authenticate, authorize("super_admin", "admin"), createOffer);
router.put("/:id", authenticate, authorize("super_admin", "admin"), updateOffer);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteOffer);

module.exports = router;