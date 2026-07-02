const express = require("express");
const { checkout, getMyOrders, getMyOrder } = require("../controllers/storefrontOrderController");
const { authenticateCustomer } = require("../middleware/customerAuthMiddleware");
const router = express.Router();

router.use(authenticateCustomer);

router.post("/checkout", checkout);
router.get("/", getMyOrders);
router.get("/:id", getMyOrder);

module.exports = router;