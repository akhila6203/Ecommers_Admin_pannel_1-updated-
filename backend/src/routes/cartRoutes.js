const express = require("express");
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require("../controllers/cartController");
const { optionalCustomerAuth } = require("../middleware/customerAuthMiddleware");
const router = express.Router();

router.use(optionalCustomerAuth);

router.get("/", getCart);
router.post("/", addToCart);
router.put("/:id", updateCartItem);
router.delete("/:id", removeCartItem);
router.delete("/", clearCart);

module.exports = router;