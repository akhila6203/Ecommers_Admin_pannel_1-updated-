const express = require("express");
const {
  register,
  login,
  logout,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("../controllers/storefrontAuthController");
const { authenticateCustomer, optionalCustomerAuth } = require("../middleware/customerAuthMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const router = express.Router();

router.post("/send-otp", optionalCustomerAuth, sendOtp);
router.post("/verify-otp", optionalCustomerAuth, verifyOtp);
router.post("/register", optionalCustomerAuth, register);
router.post("/login", optionalCustomerAuth, login);
router.post("/forgot-password", optionalCustomerAuth, forgotPassword);
router.post("/reset-password", optionalCustomerAuth, resetPassword);
router.post("/logout", authenticateCustomer, logout);
router.get("/profile", authenticateCustomer, getProfile);
router.put("/profile", authenticateCustomer, upload.single("avatar"), uploadErrorHandler, updateProfile);

router.get("/addresses", authenticateCustomer, getAddresses);
router.post("/addresses", authenticateCustomer, createAddress);
router.put("/addresses/:id", authenticateCustomer, updateAddress);
router.delete("/addresses/:id", authenticateCustomer, deleteAddress);
router.put("/addresses/:id/default", authenticateCustomer, setDefaultAddress);

module.exports = router;