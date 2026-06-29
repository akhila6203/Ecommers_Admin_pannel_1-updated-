import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { generateToken, generateRefreshToken, verifyRefreshToken, generateRandomToken } from "../helpers/jwtHelper.js";
import { hashPassword, comparePassword } from "../helpers/passwordHelper.js";
import { successResponse, errorResponse } from "../helpers/responseHelper.js";
import { activityLog } from "../middleware/auditMiddleware.js";
import logger from "../config/logger.js";

// @desc    Admin Login
// @route   POST /api/auth/login


export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admins = await query(
      "SELECT id, store_id, name, email, password, role, status, avatar FROM admins WHERE email = ? AND deleted_at IS NULL",
      [email]
    );
    // const admins = await query(
    //   "SELECT id, store_id, name, email, password, role, status, avatar FROM admins WHERE email = ? AND deleted_at IS NULL"
    //   // "SELECT id, name, email, password, role, status, avatar FROM admins WHERE email = ? AND deleted_at IS NULL",
    //   [email]
    // );

    if (!admins.length) {
      return errorResponse(res, "Invalid email or password", 401);
    }

    const admin = admins[0];

    console.log("LOGIN EMAIL:", email);
console.log("ADMIN FOUND:", admins.length);
console.log("DB HASH:", admin.password);

    if (admin.status !== "active") {
      return errorResponse(res, "Account is inactive or suspended", 403);
    }

    const isMatch = await comparePassword(password, admin.password);
    if (!isMatch) {
      return errorResponse(res, "Invalid email or password", 401);
    }

    let allowedStoreIds = [];
      if (admin.role === "super_admin") {
        const stores = await query("SELECT id FROM stores WHERE status = 'active'");
        allowedStoreIds = stores.map((s) => Number(s.id));
      } else {
        allowedStoreIds = [Number(admin.store_id || 1)];
      }

    // const tokenPayload = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
    const tokenPayload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
      store_id: admin.role === "super_admin" ? null : Number(admin.store_id || 1),
      allowed_store_ids: allowedStoreIds,
    };
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token
    await query(
      "INSERT INTO refresh_tokens (admin_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())",
      [admin.id, refreshToken]
    );

    // Update last login
    await query(
      "UPDATE admins SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?",
      [req.ip, admin.id]
    );

    await activityLog(admin.id, "login", "Admin logged in");

    return successResponse(res, {
      admin: {
        id: admin.id,
        store_id: admin.role === "super_admin" ? null : Number(admin.store_id || 1),
        allowed_store_ids: allowedStoreIds,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        avatar: admin.avatar,
      },
      token,
      refreshToken,
    }, "Login successful");
  } catch (error) {
    logger.error("Login error:", error);
    return errorResponse(res, "Login failed", 500);
  }
};

// @desc    Admin Logout
// @route   POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      // Revoke refresh tokens
      if (req.admin) {
        await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL", [req.admin.id]);
        await activityLog(req.admin.id, "logout", "Admin logged out");
      }
    }
    return successResponse(res, null, "Logged out successfully");
  } catch (error) {
    logger.error("Logout error:", error);
    return errorResponse(res, "Logout failed", 500);
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

   
    const admins = await query("SELECT id FROM admins WHERE email = ? AND deleted_at IS NULL", [email]);
    if (!admins.length) {
      return successResponse(res, null, "If the email exists, a reset link has been sent");
    }

    const resetToken = generateRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      "INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, NOW())",
      [email, resetToken, expiresAt]
    );

    // TODO: Send email with reset link
    logger.info(`Password reset token for ${email}: ${resetToken}`);

    return successResponse(res, { resetToken }, "Password reset link sent to your email");
  } catch (error) {
    logger.error("Forgot password error:", error);
    return errorResponse(res, "Failed to process request", 500);
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const resets = await query(
      "SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > NOW()",
      [token]
    );

    if (!resets.length) {
      return errorResponse(res, "Invalid or expired reset token", 400);
    }

    const hashedPassword = await hashPassword(password);

    await query("UPDATE admins SET password = ? WHERE email = ?", [hashedPassword, resets[0].email]);
    await query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [resets[0].id]);

    return successResponse(res, null, "Password reset successful");
  } catch (error) {
    logger.error("Reset password error:", error);
    return errorResponse(res, "Failed to reset password", 500);
  }
};

// @desc    Change Password
// @route   POST /api/auth/change-password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    const admins = await query("SELECT password FROM admins WHERE id = ?", [adminId]);
    if (!admins.length) {
      return errorResponse(res, "Admin not found", 404);
    }

    const isMatch = await comparePassword(currentPassword, admins[0].password);
    if (!isMatch) {
      return errorResponse(res, "Current password is incorrect", 400);
    }

    const hashedPassword = await hashPassword(newPassword);
    await query("UPDATE admins SET password = ? WHERE id = ?", [hashedPassword, adminId]);

    await activityLog(adminId, "change_password", "Password changed");

    return successResponse(res, null, "Password changed successfully");
  } catch (error) {
    logger.error("Change password error:", error);
    return errorResponse(res, "Failed to change password", 500);
  }
};

// @desc    Refresh Token
// @route   POST /api/auth/refresh-token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return errorResponse(res, "Refresh token is required", 400);
    }

    const decoded = verifyRefreshToken(token);

    const tokens = await query(
      "SELECT * FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL AND expires_at > NOW()",
      [token]
    );

    if (!tokens.length) {
      return errorResponse(res, "Invalid or expired refresh token", 401);
    }

    const adminId = decoded.id;
    const admins = await query("SELECT id,store_id, name, email, role FROM admins WHERE id = ? AND status = 'active'", [adminId]);
    if (!admins.length) {
      return errorResponse(res, "Admin not found", 404);
    }

    const admin = admins[0];
    let allowedStoreIds = [];

if (admin.role === "super_admin") {
  const stores = await query("SELECT id FROM stores WHERE status = 'active'");
  allowedStoreIds = stores.map((s) => Number(s.id));
} else {
  allowedStoreIds = [Number(admin.store_id || 1)];
}

const tokenPayload = {
  id: admin.id,
  email: admin.email,
  role: admin.role,
  name: admin.name,
  store_id: admin.role === "super_admin" ? null : Number(admin.store_id || 1),
  allowed_store_ids: allowedStoreIds,
};
    // const tokenPayload = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
    const newToken = generateToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Revoke old refresh token
    await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?", [tokens[0].id]);

    // Save new refresh token
    await query(
      "INSERT INTO refresh_tokens (admin_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())",
      [admin.id, newRefreshToken]
    );

    return successResponse(res, {
      token: newToken,
      refreshToken: newRefreshToken,
    }, "Token refreshed successfully");
  } catch (error) {
    logger.error("Refresh token error:", error);
    return errorResponse(res, "Invalid refresh token", 401);
  }
};

// @desc    Get Current Admin Profile
// @route   GET /api/auth/profile
export const getProfile = async (req, res) => {
  try {
    const admins = await query(
  "SELECT id, store_id, name, email, phone, role, avatar, status, last_login_at FROM admins WHERE id = ?",
  [req.admin.id]
);
    // const admins = await query(
    //   "SELECT id, store_id, name, email, phone, role, avatar, status, last_login_at FROM admins WHERE id = ?"
    //   // "SELECT id, name, email, phone, role, avatar, status, last_login_at FROM admins WHERE id = ?",
    //   [req.admin.id]
    // );

    if (!admins.length) {
      return errorResponse(res, "Admin not found", 404);
    }

    return successResponse(res, admins[0]);
  } catch (error) {
    logger.error("Get profile error:", error);
    return errorResponse(res, "Failed to get profile", 500);
  }
};

// @desc    Update Admin Profile
// @route   PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const adminId = req.admin.id;

    await query("UPDATE admins SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?", [name ?? null, phone ?? null, adminId]);

    await activityLog(adminId, "update_profile", "Profile updated");

    return successResponse(res, null, "Profile updated successfully");
  } catch (error) {
    logger.error("Update profile error:", error);
    return errorResponse(res, "Failed to update profile", 500);
  }
};


// import bcrypt from "bcryptjs";
// import { query } from "../config/db.js";
// import { generateToken, generateRefreshToken, verifyRefreshToken, generateRandomToken } from "../helpers/jwtHelper.js";
// import { hashPassword, comparePassword } from "../helpers/passwordHelper.js";
// import { successResponse, errorResponse } from "../helpers/responseHelper.js";
// import { activityLog } from "../middleware/auditMiddleware.js";
// import logger from "../config/logger.js";

// // @desc    Admin Login
// // @route   POST /api/auth/login
// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const admins = await query(
//       "SELECT id, name, email, password, role, status, avatar FROM admins WHERE email = ? AND deleted_at IS NULL",
//       [email]
//     );

//     if (!admins.length) {
//       return errorResponse(res, "Invalid email or password", 401);
//     }

//     const admin = admins[0];

//     if (admin.status !== "active") {
//       return errorResponse(res, "Account is inactive or suspended", 403);
//     }

//     const isMatch = await comparePassword(password, admin.password);
//     if (!isMatch) {
//       return errorResponse(res, "Invalid email or password", 401);
//     }

//     const tokenPayload = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
//     const token = generateToken(tokenPayload);
//     const refreshToken = generateRefreshToken(tokenPayload);

//     // Save refresh token
//     await query(
//       "INSERT INTO refresh_tokens (admin_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())",
//       [admin.id, refreshToken]
//     );

//     // Update last login
//     await query(
//       "UPDATE admins SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?",
//       [req.ip, admin.id]
//     );

//     await activityLog(admin.id, "login", "Admin logged in");

//     return successResponse(res, {
//       admin: {
//         id: admin.id,
//         name: admin.name,
//         email: admin.email,
//         role: admin.role,
//         avatar: admin.avatar,
//       },
//       token,
//       refreshToken,
//     }, "Login successful");
//   } catch (error) {
//     logger.error("Login error:", error);
//     return errorResponse(res, "Login failed", 500);
//   }
// };

// // @desc    Admin Logout
// // @route   POST /api/auth/logout
// export const logout = async (req, res) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (authHeader) {
//       const token = authHeader.split(" ")[1];
//       // Revoke refresh tokens
//       if (req.admin) {
//         await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL", [req.admin.id]);
//         await activityLog(req.admin.id, "logout", "Admin logged out");
//       }
//     }
//     return successResponse(res, null, "Logged out successfully");
//   } catch (error) {
//     logger.error("Logout error:", error);
//     return errorResponse(res, "Logout failed", 500);
//   }
// };

// // @desc    Forgot Password
// // @route   POST /api/auth/forgot-password
// export const forgotPassword = async (req, res) => {
//   try {
//     const { email } = req.body;

//     const admins = await query("SELECT id FROM admins WHERE email = ? AND deleted_at IS NULL", [email]);
//     if (!admins.length) {
//       return successResponse(res, null, "If the email exists, a reset link has been sent");
//     }

//     const resetToken = generateRandomToken();
//     const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

//     await query(
//       "INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, NOW())",
//       [email, resetToken, expiresAt]
//     );

//     // TODO: Send email with reset link
//     logger.info(`Password reset token for ${email}: ${resetToken}`);

//     return successResponse(res, { resetToken }, "Password reset link sent to your email");
//   } catch (error) {
//     logger.error("Forgot password error:", error);
//     return errorResponse(res, "Failed to process request", 500);
//   }
// };

// // @desc    Reset Password
// // @route   POST /api/auth/reset-password
// export const resetPassword = async (req, res) => {
//   try {
//     const { token, password } = req.body;

//     const resets = await query(
//       "SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > NOW()",
//       [token]
//     );

//     if (!resets.length) {
//       return errorResponse(res, "Invalid or expired reset token", 400);
//     }

//     const hashedPassword = await hashPassword(password);

//     await query("UPDATE admins SET password = ? WHERE email = ?", [hashedPassword, resets[0].email]);
//     await query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [resets[0].id]);

//     return successResponse(res, null, "Password reset successful");
//   } catch (error) {
//     logger.error("Reset password error:", error);
//     return errorResponse(res, "Failed to reset password", 500);
//   }
// };

// // @desc    Change Password
// // @route   POST /api/auth/change-password
// export const changePassword = async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
//     const adminId = req.admin.id;

//     const admins = await query("SELECT password FROM admins WHERE id = ?", [adminId]);
//     if (!admins.length) {
//       return errorResponse(res, "Admin not found", 404);
//     }

//     const isMatch = await comparePassword(currentPassword, admins[0].password);
//     if (!isMatch) {
//       return errorResponse(res, "Current password is incorrect", 400);
//     }

//     const hashedPassword = await hashPassword(newPassword);
//     await query("UPDATE admins SET password = ? WHERE id = ?", [hashedPassword, adminId]);

//     await activityLog(adminId, "change_password", "Password changed");

//     return successResponse(res, null, "Password changed successfully");
//   } catch (error) {
//     logger.error("Change password error:", error);
//     return errorResponse(res, "Failed to change password", 500);
//   }
// };

// // @desc    Refresh Token
// // @route   POST /api/auth/refresh-token
// export const refreshToken = async (req, res) => {
//   try {
//     const { refreshToken: token } = req.body;
//     if (!token) {
//       return errorResponse(res, "Refresh token is required", 400);
//     }

//     const decoded = verifyRefreshToken(token);

//     const tokens = await query(
//       "SELECT * FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL AND expires_at > NOW()",
//       [token]
//     );

//     if (!tokens.length) {
//       return errorResponse(res, "Invalid or expired refresh token", 401);
//     }

//     const adminId = decoded.id;
//     const admins = await query("SELECT id, name, email, role FROM admins WHERE id = ? AND status = 'active'", [adminId]);
//     if (!admins.length) {
//       return errorResponse(res, "Admin not found", 404);
//     }

//     const admin = admins[0];
//     const tokenPayload = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
//     const newToken = generateToken(tokenPayload);
//     const newRefreshToken = generateRefreshToken(tokenPayload);

//     // Revoke old refresh token
//     await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?", [tokens[0].id]);

//     // Save new refresh token
//     await query(
//       "INSERT INTO refresh_tokens (admin_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())",
//       [admin.id, newRefreshToken]
//     );

//     return successResponse(res, {
//       token: newToken,
//       refreshToken: newRefreshToken,
//     }, "Token refreshed successfully");
//   } catch (error) {
//     logger.error("Refresh token error:", error);
//     return errorResponse(res, "Invalid refresh token", 401);
//   }
// };

// // @desc    Get Current Admin Profile
// // @route   GET /api/auth/profile
// export const getProfile = async (req, res) => {
//   try {
//     const admins = await query(
//       "SELECT id, name, email, phone, role, avatar, status, last_login_at FROM admins WHERE id = ?",
//       [req.admin.id]
//     );

//     if (!admins.length) {
//       return errorResponse(res, "Admin not found", 404);
//     }

//     return successResponse(res, admins[0]);
//   } catch (error) {
//     logger.error("Get profile error:", error);
//     return errorResponse(res, "Failed to get profile", 500);
//   }
// };

// // @desc    Update Admin Profile
// // @route   PUT /api/auth/profile
// export const updateProfile = async (req, res) => {
//   try {
//     const { name, phone } = req.body;
//     const adminId = req.admin.id;

//     await query("UPDATE admins SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?", [name ?? null, phone ?? null, adminId]);

//     await activityLog(adminId, "update_profile", "Profile updated");

//     return successResponse(res, null, "Profile updated successfully");
//   } catch (error) {
//     logger.error("Update profile error:", error);
//     return errorResponse(res, "Failed to update profile", 500);
//   }
// };