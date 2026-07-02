const { query } = require("../config/db");
const { generateToken, generateRefreshToken } = require("../helpers/jwtHelper");
const { hashPassword, comparePassword } = require("../helpers/passwordHelper");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const { getSessionId, mergeSessionCartToCustomer } = require("../helpers/cartHelper");
const {
  isValidIndianPhone,
  normalizeIndianPhone,
  hashResetToken,
} = require("../helpers/otpHelper");
const {
  createAndSendOtp,
  verifyOtpCode,
  assertRegisterPhoneVerified,
} = require("../services/customerOtpService");
const logger = require("../config/logger");
const customerFields =
  "id, store_id, first_name, last_name, email, phone, avatar, gender, date_of_birth, status, total_orders, total_spent, created_at, last_login_at";

const buildCustomerPayload = (customer) => ({
  id: customer.id,
  store_id: customer.store_id,
  first_name: customer.first_name,
  last_name: customer.last_name,
  email: customer.email,
  phone: customer.phone,
  avatar: customer.avatar,
  gender: customer.gender,
  date_of_birth: customer.date_of_birth,
  status: customer.status,
  total_orders: customer.total_orders,
  total_spent: customer.total_spent,
  created_at: customer.created_at,
  last_login_at: customer.last_login_at,
});

const issueTokens = async (customer) => {
  const tokenPayload = {
    id: customer.id,
    email: customer.email,
    role: "customer",
    storeId: customer.store_id,
    firstName: customer.first_name,
    lastName: customer.last_name,
  };

  const token = generateToken(tokenPayload, "7d");
  const refreshToken = generateRefreshToken(tokenPayload);

  await query(
    "INSERT INTO refresh_tokens (customer_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())",
    [customer.id, refreshToken]
  );

  return { token, refreshToken };
};

const sendOtp = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone, email, purpose } = req.body;

    if (!phone?.trim()) {
      return errorResponse(res, "Phone number is required", 400);
    }
    if (!purpose || !["register", "forgot_password"].includes(purpose)) {
      return errorResponse(res, "Valid purpose (register or forgot_password) is required", 400);
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalizedPhone)) {
      return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
    }

    if (purpose === "register") {
      const existingEmail = email?.trim()
        ? await query(
            "SELECT id FROM customers WHERE email = ? AND store_id = ?",
            [email.trim().toLowerCase(), storeId]
          )
        : [];
      if (existingEmail.length) {
        return errorResponse(res, "Email already registered", 409);
      }

      const existingPhone = await query(
        "SELECT id FROM customers WHERE phone = ? AND store_id = ?",
        [normalizedPhone, storeId]
      );
      if (existingPhone.length) {
        return errorResponse(res, "Phone number already registered", 409);
      }
    }

    if (purpose === "forgot_password") {
      const existingPhone = await query(
        "SELECT id FROM customers WHERE phone = ? AND store_id = ?",
        [normalizedPhone, storeId]
      );
      if (!existingPhone.length) {
        return errorResponse(res, "No account found with this phone number", 404);
      }
    }

    await createAndSendOtp({
      storeId,
      phone: normalizedPhone,
      email: email?.trim()?.toLowerCase() || null,
      purpose,
    });

    return successResponse(res, { phone: normalizedPhone }, "OTP sent to your WhatsApp");
  } catch (error) {
    logger.error("Send OTP error:", error);
    return errorResponse(
      res,
      error.message || "Failed to send OTP",
      error.statusCode || 500
    );
  }
};

const verifyOtp = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone, otp, purpose } = req.body;

    if (!phone?.trim() || !otp?.trim()) {
      return errorResponse(res, "Phone and OTP are required", 400);
    }
    if (!purpose || !["register", "forgot_password"].includes(purpose)) {
      return errorResponse(res, "Valid purpose (register or forgot_password) is required", 400);
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalizedPhone)) {
      return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
    }

    const { verificationToken } = await verifyOtpCode({
      storeId,
      phone: normalizedPhone,
      otp: otp.trim(),
      purpose,
    });

    return successResponse(
      res,
      { verification_token: verificationToken, phone: normalizedPhone },
      "OTP verified successfully"
    );
  } catch (error) {
    logger.error("Verify OTP error:", error);
    return errorResponse(
      res,
      error.message || "OTP verification failed",
      error.statusCode || 400
    );
  }
};

const register = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { first_name, last_name, email, phone, password, verification_token } = req.body;

    if (
      !first_name?.trim() ||
      !last_name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !password ||
      !verification_token
    ) {
      return errorResponse(
        res,
        "First name, last name, email, phone, password and verified OTP are required",
        400
      );
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalizedPhone)) {
      return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
    }

    try {
      assertRegisterPhoneVerified({
        storeId,
        phone: normalizedPhone,
        verificationToken: verification_token,
      });
    } catch (verifyError) {
      return errorResponse(
        res,
        verifyError.message || "Phone verification required. Please verify OTP first.",
        400
      );
    }

    const existing = await query(
      "SELECT id FROM customers WHERE email = ? AND store_id = ?",
      [email.trim().toLowerCase(), storeId]
    );
    if (existing.length) {
      return errorResponse(res, "Email already registered", 409);
    }

    const existingPhone = await query(
      "SELECT id FROM customers WHERE phone = ? AND store_id = ?",
      [normalizedPhone, storeId]
    );
    if (existingPhone.length) {
      return errorResponse(res, "Phone number already registered", 409);
    }

    const hashedPassword = await hashPassword(password);
    const result = await query(
      `INSERT INTO customers
        (store_id, first_name, last_name, email, phone, password, phone_verified)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        storeId,
        first_name.trim(),
        last_name.trim(),
        email.trim().toLowerCase(),
        normalizedPhone,
        hashedPassword,
      ]
    );

    const customers = await query(
      `SELECT ${customerFields} FROM customers WHERE id = ? AND store_id = ?`,
      [result.insertId, storeId]
    );
    const customer = customers[0];

    return res.status(201).json({
      success: true,
      message: "Registration successful. Please login.",
      customer: buildCustomerPayload(customer),
    });
  } catch (error) {
    logger.error("Customer register error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Registration failed",
      500
    );
  }
};

const login = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { email, phone, password } = req.body;

    if (!password) {
      return errorResponse(res, "Password is required", 400);
    }

    const hasEmail = Boolean(email?.trim());
    const hasPhone = Boolean(phone?.trim());

    if (!hasEmail && !hasPhone) {
      return errorResponse(res, "Email or phone and password are required", 400);
    }
    if (hasEmail && hasPhone) {
      return errorResponse(res, "Please login with either email or phone, not both", 400);
    }

    let customers;
    if (hasEmail) {
      customers = await query(
        `SELECT id, store_id, first_name, last_name, email, password, phone, avatar, gender,
                date_of_birth, status, total_orders, total_spent, created_at, last_login_at
         FROM customers WHERE email = ? AND store_id = ?`,
        [email.trim().toLowerCase(), storeId]
      );
    } else {
      const normalizedPhone = normalizeIndianPhone(phone);
      if (!isValidIndianPhone(normalizedPhone)) {
        return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
      }
      customers = await query(
        `SELECT id, store_id, first_name, last_name, email, password, phone, avatar, gender,
                date_of_birth, status, total_orders, total_spent, created_at, last_login_at
         FROM customers WHERE phone = ? AND store_id = ?`,
        [normalizedPhone, storeId]
      );
    }

    if (!customers.length) {
      return errorResponse(res, "Invalid credentials", 401);
    }

    const customer = customers[0];

    if (customer.status === "blocked") {
      return errorResponse(res, "Your account has been blocked. Contact support.", 403);
    }
    if (customer.status === "inactive") {
      return errorResponse(res, "Your account is inactive", 403);
    }

    const isMatch = await comparePassword(password, customer.password);
    if (!isMatch) {
      return errorResponse(res, "Invalid credentials", 401);
    }

    await query(
      "UPDATE customers SET last_login_at = NOW() WHERE id = ? AND store_id = ?",
      [customer.id, storeId]
    );

    // const sessionId = getSessionId(req);
    // if (sessionId) {
    //   await mergeSessionCartToCustomer(storeId, sessionId, customer.id);
    // }
    const sessionId = getSessionId(req);

if (sessionId) {
  try {
    await mergeSessionCartToCustomer(storeId, sessionId, customer.id);
  } catch (mergeError) {
    logger.error("Cart merge after login failed:", mergeError);
  }
}

    await query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE customer_id = ? AND revoked_at IS NULL",
      [customer.id]
    );

    const { token, refreshToken } = await issueTokens(customer);

    return successResponse(res, {
      customer: buildCustomerPayload(customer),
      token,
      refreshToken,
    }, "Login successful");
  } catch (error) {
    logger.error("Customer login error:", error);
    return errorResponse(res, "Login failed", 500);
  }
};

const logout = async (req, res) => {
  try {
    if (req.customer?.id) {
      await query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE customer_id = ? AND revoked_at IS NULL",
        [req.customer.id]
      );
    }
    return successResponse(res, null, "Logged out successfully");
  } catch (error) {
    logger.error("Customer logout error:", error);
    return errorResponse(res, "Logout failed", 500);
  }
};

const getProfile = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customers = await query(
      `SELECT ${customerFields} FROM customers WHERE id = ? AND store_id = ?`,
      [req.customer.id, storeId]
    );
    if (!customers.length) return errorResponse(res, "Customer not found", 404);

    const customer = customers[0];
    try {
      customer.addresses = await query(
        "SELECT * FROM customer_addresses WHERE customer_id = ? AND store_id = ? ORDER BY is_default DESC, created_at DESC",
        [customer.id, storeId]
      );
    } catch (addressError) {
      logger.warn("Profile addresses skipped:", addressError.message);
      customer.addresses = [];
    }

    let cartCount = 0;
    let wishlistCount = 0;

    try {
      const cartCountRows = await query(
        "SELECT COUNT(*) as count FROM cart WHERE customer_id = ? AND store_id = ?",
        [customer.id, storeId]
      );
      cartCount = cartCountRows[0]?.count ?? 0;
    } catch (cartError) {
      logger.warn("Profile cart count skipped:", cartError.message);
    }

    try {
      const wishlistCountRows = await query(
        "SELECT COUNT(*) as count FROM wishlists WHERE customer_id = ? AND store_id = ?",
        [customer.id, storeId]
      );
      wishlistCount = wishlistCountRows[0]?.count ?? 0;
    } catch (wishlistError) {
      logger.warn("Profile wishlist count skipped:", wishlistError.message);
    }

    return successResponse(res, {
      ...buildCustomerPayload(customer),
      addresses: customer.addresses,
      cart_count: cartCount,
      wishlist_count: wishlistCount,
    });
  } catch (error) {
    logger.error("Get customer profile error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to fetch profile",
      500
    );
  }
};

const updateProfile = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { first_name, last_name, phone, gender, date_of_birth } = req.body;

    let avatarPath = null;
    if (req.file) {
      avatarPath = `uploads/customers/${req.file.filename}`;
    }

    await query(
      `UPDATE customers SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        phone = COALESCE(?, phone),
        gender = COALESCE(?, gender),
        date_of_birth = COALESCE(?, date_of_birth),
        avatar = COALESCE(?, avatar)
       WHERE id = ? AND store_id = ?`,
      [
        first_name || null,
        last_name || null,
        phone || null,
        gender || null,
        date_of_birth || null,
        avatarPath,
        req.customer.id,
        storeId,
      ]
    );

    const customers = await query(
      `SELECT ${customerFields} FROM customers WHERE id = ? AND store_id = ?`,
      [req.customer.id, storeId]
    );

    const customer = customers[0];
    customer.addresses = await query(
      "SELECT * FROM customer_addresses WHERE customer_id = ? AND store_id = ? ORDER BY is_default DESC, created_at DESC",
      [customer.id, storeId]
    );

    return successResponse(res, buildCustomerPayload(customer), "Profile updated");
  } catch (error) {
    logger.error("Update customer profile error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to update profile",
      500
    );
  }
};

const ADDRESS_FIELDS =
  "id, store_id, customer_id, address_type, full_name, phone, address_line1, address_line2, city, state, pincode, country, is_default, created_at, updated_at";

const normalizeAddressBody = (body) => ({
  address_type: body.address_type || "shipping",
  full_name: body.full_name?.trim(),
  phone: body.phone?.trim(),
  address_line1: body.address_line1?.trim(),
  address_line2: body.address_line2?.trim() || null,
  city: body.city?.trim(),
  state: body.state?.trim(),
  pincode: body.pincode?.trim(),
  country: body.country?.trim() || "India",
  is_default: body.is_default ? 1 : 0,
});

const validateAddressPayload = (payload) => {
  if (!payload.full_name) return "Full name is required";
  if (!payload.phone) return "Phone is required";
  if (!payload.address_line1) return "Address line 1 is required";
  if (!payload.city) return "City is required";
  if (!payload.state) return "State is required";
  if (!payload.pincode) return "Pincode is required";
  return null;
};

const clearDefaultAddresses = async (customerId, storeId, exceptId = null) => {
  const params = [customerId, storeId];
  let sql =
    "UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? AND store_id = ?";
  if (exceptId) {
    sql += " AND id != ?";
    params.push(exceptId);
  }
  await query(sql, params);
};

const getAddresses = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses
       WHERE store_id = ? AND customer_id = ?
       ORDER BY is_default DESC, created_at DESC`,
      [storeId, customerId]
    );

    return successResponse(res, rows, "Addresses fetched successfully");
  } catch (error) {
    logger.error("Get addresses error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to fetch addresses",
      500
    );
  }
};

const createAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const payload = normalizeAddressBody(req.body);
    const validationError = validateAddressPayload(payload);
    if (validationError) return errorResponse(res, validationError, 400);

    if (payload.is_default) {
      await clearDefaultAddresses(customerId, storeId);
    }

    const result = await query(
      `INSERT INTO customer_addresses
        (store_id, customer_id, address_type, full_name, phone, address_line1, address_line2, city, state, pincode, country, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        customerId,
        payload.address_type,
        payload.full_name,
        payload.phone,
        payload.address_line1,
        payload.address_line2,
        payload.city,
        payload.state,
        payload.pincode,
        payload.country,
        payload.is_default,
      ]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [result.insertId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Address added successfully", 201);
  } catch (error) {
    logger.error("Create address error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to add address",
      500
    );
  }
};

const updateAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      "SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    const payload = normalizeAddressBody(req.body);
    const validationError = validateAddressPayload(payload);
    if (validationError) return errorResponse(res, validationError, 400);

    if (payload.is_default) {
      await clearDefaultAddresses(customerId, storeId, addressId);
    }

    await query(
      `UPDATE customer_addresses SET
        address_type = ?, full_name = ?, phone = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, pincode = ?, country = ?, is_default = ?
       WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [
        payload.address_type,
        payload.full_name,
        payload.phone,
        payload.address_line1,
        payload.address_line2,
        payload.city,
        payload.state,
        payload.pincode,
        payload.country,
        payload.is_default,
        addressId,
        storeId,
        customerId,
      ]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Address updated successfully");
  } catch (error) {
    logger.error("Update address error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to update address",
      500
    );
  }
};

const deleteAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      "SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    await query(
      "DELETE FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );

    return successResponse(res, null, "Address deleted successfully");
  } catch (error) {
    logger.error("Delete address error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to delete address",
      500
    );
  }
};

const forgotPassword = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone } = req.body;

    if (!phone?.trim()) {
      return errorResponse(res, "Phone number is required", 400);
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalizedPhone)) {
      return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
    }

    const existing = await query(
      "SELECT id FROM customers WHERE phone = ? AND store_id = ?",
      [normalizedPhone, storeId]
    );
    if (!existing.length) {
      return errorResponse(res, "No account found with this phone number", 404);
    }

    await createAndSendOtp({
      storeId,
      phone: normalizedPhone,
      purpose: "forgot_password",
    });

    return successResponse(res, { phone: normalizedPhone }, "OTP sent to your WhatsApp");
  } catch (error) {
    logger.error("Forgot password error:", error);
    return errorResponse(
      res,
      error.message || "Failed to send reset OTP",
      error.statusCode || 500
    );
  }
};

const resetPassword = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone, otp, password } = req.body;

    if (!phone?.trim() || !otp?.trim() || !password) {
      return errorResponse(res, "Phone, OTP and new password are required", 400);
    }

    if (password.length < 6) {
      return errorResponse(res, "Password must be at least 6 characters long", 400);
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalizedPhone)) {
      return errorResponse(res, "Please enter a valid 10-digit Indian mobile number", 400);
    }

    await verifyOtpCode({
      storeId,
      phone: normalizedPhone,
      otp: otp.trim(),
      purpose: "forgot_password",
    });

    const hashedPassword = await hashPassword(password);
    const resetToken = hashResetToken(`${normalizedPhone}:${Date.now()}`);

    await query(
      `UPDATE customers
       SET password = ?, reset_token = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)
       WHERE phone = ? AND store_id = ?`,
      [hashedPassword, resetToken, normalizedPhone, storeId]
    );

    return successResponse(res, null, "Password reset successful. Please login with your new password.");
  } catch (error) {
    logger.error("Reset password error:", error);
    return errorResponse(
      res,
      error.message || "Failed to reset password",
      error.statusCode || 400
    );
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      "SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    await clearDefaultAddresses(customerId, storeId);
    await query(
      "UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Default address updated");
  } catch (error) {
    logger.error("Set default address error:", error);
    return errorResponse(
      res,
      error.sqlMessage || error.message || "Failed to set default address",
      500
    );
  }
};

module.exports.sendOtp = sendOtp;
module.exports.verifyOtp = verifyOtp;
module.exports.register = register;
module.exports.login = login;
module.exports.logout = logout;
module.exports.getProfile = getProfile;
module.exports.updateProfile = updateProfile;
module.exports.getAddresses = getAddresses;
module.exports.createAddress = createAddress;
module.exports.updateAddress = updateAddress;
module.exports.deleteAddress = deleteAddress;
module.exports.forgotPassword = forgotPassword;
module.exports.resetPassword = resetPassword;
module.exports.setDefaultAddress = setDefaultAddress;
