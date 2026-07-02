const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getStores,
  getStore,
  createStore,
  updateStore,
  deleteStore,
  getCurrentStore,
} = require("../controllers/storeController");
const router = express.Router();

router.get("/", authenticate, authorize("super_admin", "admin"), getStores);
router.get("/current", getCurrentStore);
router.get("/:id", authenticate, authorize("super_admin", "admin"), getStore);
router.post("/", authenticate, authorize("super_admin"), createStore);
router.put("/:id", authenticate, authorize("super_admin"), updateStore);
router.delete("/:id", authenticate, authorize("super_admin"), deleteStore);

module.exports = router;