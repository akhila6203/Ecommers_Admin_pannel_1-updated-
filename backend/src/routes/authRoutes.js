const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiterMiddleware");
const { validateLogin, validateForgotPassword, validateResetPassword, validateChangePassword } = require("../validators/authValidator");
const {
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  refreshToken,
  getProfile,
  updateProfile,
} = require("../controllers/authController");
const router = express.Router();

router.post("/login", authLimiter, validateLogin, login);
router.post("/logout", authenticate, logout);
router.post("/forgot-password", authLimiter, validateForgotPassword, forgotPassword);
router.post("/reset-password", validateResetPassword, resetPassword);
router.post("/change-password", authenticate, validateChangePassword, changePassword);
router.post("/refresh-token", refreshToken);
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);

module.exports = router;