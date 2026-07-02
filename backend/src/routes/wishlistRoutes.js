const express = require("express");
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
  checkWishlist,
} = require("../controllers/wishlistController");
const { authenticateCustomer } = require("../middleware/customerAuthMiddleware");
const router = express.Router();

router.use(authenticateCustomer);

router.get("/", getWishlist);
router.post("/", addToWishlist);
router.post("/toggle", toggleWishlist);
router.get("/check/:productId", checkWishlist);
router.delete("/:productId", removeFromWishlist);

module.exports = router;