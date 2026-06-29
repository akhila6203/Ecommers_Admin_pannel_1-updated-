import { verifyToken } from "../helpers/jwtHelper.js";
import { errorResponse } from "../helpers/responseHelper.js";

/**
 * Authenticate using JWT claims only — no DB round-trip per request.
 * Token payload: { id, email, role, name }
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, "Access denied. No token provided", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded?.id || !decoded?.role) {
      return errorResponse(res, "Invalid token payload", 401);
    }

    req.admin = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name || "",
      store_id: decoded.store_id ?? null,
      allowed_store_ids: decoded.allowed_store_ids || [],
    };
    if (req.admin.role !== "super_admin") {
      req.storeId = Number(req.admin.store_id || 1);
      req.headers["x-store-id"] = String(req.storeId);
    }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, "Token expired", 401);
    }
    return errorResponse(res, "Invalid token", 401);
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);
      if (decoded?.id) {
        req.admin = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          name: decoded.name || "",
          store_id: decoded.store_id ?? null,
allowed_store_ids: decoded.allowed_store_ids || [],
        };
      }
      
    }
  } catch {
    // optional — ignore
  }
  next();
};
