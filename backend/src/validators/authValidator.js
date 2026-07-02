const { errorResponse } = require("../helpers/responseHelper");
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || typeof email !== "string") {
    errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Invalid email format");
  }

  if (!password || typeof password !== "string") {
    errors.push("Password is required");
  } else if (password.length < 6) {
    errors.push("Password must be at least 6 characters");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(res, "Valid email is required", 400, ["Valid email is required"]);
  }
  next();
};

const validateResetPassword = (req, res, next) => {
  const { token, password } = req.body;
  const errors = [];

  if (!token) errors.push("Reset token is required");
  if (!password || password.length < 6) {
    errors.push("Password must be at least 6 characters");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const errors = [];

  if (!currentPassword) errors.push("Current password is required");
  if (!newPassword || newPassword.length < 6) {
    errors.push("New password must be at least 6 characters");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

module.exports.validateLogin = validateLogin;
module.exports.validateForgotPassword = validateForgotPassword;
module.exports.validateResetPassword = validateResetPassword;
module.exports.validateChangePassword = validateChangePassword;
