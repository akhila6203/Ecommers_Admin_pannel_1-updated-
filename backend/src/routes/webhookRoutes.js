const { Router } = require("express");
const { handleShiprocketWebhook } = require("../controllers/webhookController");
const router = Router();

router.post("/shiprocket", handleShiprocketWebhook);

module.exports = router;