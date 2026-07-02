const { errorResponse } = require("../helpers/responseHelper");

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    console.log("AUTH CHECK:", {
      admin: req.admin,
      role: req.admin?.role,
      allowedRoles,
    });

    if (!req.admin) {
      return errorResponse(res, "Access denied. Not authenticated", 401);
    }

    const userRole = String(req.admin.role || "").trim().toLowerCase();
    const allowed = allowedRoles.map((r) => String(r).trim().toLowerCase());

    if (!allowed.includes(userRole)) {
      return errorResponse(
        res,
        `Access denied. Role '${userRole}' not allowed for this action`,
        403
      );
    }

    next();
  };
};

module.exports.authorize = authorize;