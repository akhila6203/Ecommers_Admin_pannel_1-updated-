const express = require("express");
const { createPayment, verifyPayment } = require("../controllers/storefrontPaymentController");
const { authenticateCustomer } = require("../middleware/customerAuthMiddleware");
const router = express.Router();

router.post("/create", authenticateCustomer, createPayment);
router.post("/verify", authenticateCustomer, verifyPayment);

module.exports = router;