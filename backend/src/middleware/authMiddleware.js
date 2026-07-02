const { verifyToken } = require("../helpers/jwtHelper");
const { errorResponse } = require("../helpers/responseHelper");

const buildAdminFromToken = (decoded) => ({
  id: decoded.id,
  email: decoded.email,
  role: decoded.role,
  name: decoded.name || "",
  store_id: decoded.store_id ?? null,
  allowed_store_ids: decoded.allowed_store_ids || [],
});

const applyStoreForAdmin = (req) => {
  if (req.admin && req.admin.role !== "super_admin") {
    req.storeId = Number(req.admin.store_id || 1);
    req.headers["x-store-id"] = String(req.storeId);
  }
};

const getTokenFromRequest = (req) => {
  return (
    req.cookies?.lm_admin_token ||
    req.headers.authorization?.replace("Bearer ", "")
  );
};

const authenticate = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return errorResponse(res, "Access denied. No token provided", 401);
    }

    const decoded = verifyToken(token);

    if (!decoded?.id || !decoded?.role) {
      return errorResponse(res, "Invalid token payload", 401);
    }

    req.admin = buildAdminFromToken(decoded);
    applyStoreForAdmin(req);

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, "Token expired", 401);
    }

    return errorResponse(res, "Invalid token", 401);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (token) {
      const decoded = verifyToken(token);

      if (decoded?.id && decoded?.role) {
        req.admin = buildAdminFromToken(decoded);
        applyStoreForAdmin(req);
      }
    }
  } catch {
    // public request, ignore invalid/missing token
  }

  next();
};

module.exports.authenticate = authenticate;
module.exports.optionalAuth = optionalAuth;

// const { verifyToken } = require("../helpers/jwtHelper");
// const { errorResponse } = require("../helpers/responseHelper");
// /**
//  * Authenticate using JWT claims only — no DB round-trip per request.
//  * Token payload: { id, email, role, name }
//  */
// const authenticate = async (req, res, next) => {
//   try {
//     const token =
//       req.cookies?.lm_admin_token ||
//       req.headers.authorization?.replace("Bearer ", "");

//     if (!token) {
//       return errorResponse(res, "Access denied. No token provided", 401);
//     }
//     // const authHeader = req.headers.authorization;
//     // if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     //   return errorResponse(res, "Access denied. No token provided", 401);
//     // }

//     // const token = authHeader.split(" ")[1];

//     const decoded = verifyToken(token);

//     if (!decoded?.id || !decoded?.role) {
//       return errorResponse(res, "Invalid token payload", 401);
//     }

//     req.admin = {
//       id: decoded.id,
//       email: decoded.email,
//       role: decoded.role,
//       name: decoded.name || "",
//       store_id: decoded.store_id ?? null,
//       allowed_store_ids: decoded.allowed_store_ids || [],
//     };
//     if (req.admin.role !== "super_admin") {
//       req.storeId = Number(req.admin.store_id || 1);
//       req.headers["x-store-id"] = String(req.storeId);
//     }
//     next();
//   } catch (error) {
//     if (error.name === "TokenExpiredError") {
//       return errorResponse(res, "Token expired", 401);
//     }
//     return errorResponse(res, "Invalid token", 401);
//   }
// };

// const optionalAuth = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (authHeader && authHeader.startsWith("Bearer ")) {
//       const token = authHeader.split(" ")[1];
//       const decoded = verifyToken(token);
//       if (decoded?.id) {
//         req.admin = {
//           id: decoded.id,
//           email: decoded.email,
//           role: decoded.role,
//           name: decoded.name || "",
//           store_id: decoded.store_id ?? null,
// allowed_store_ids: decoded.allowed_store_ids || [],
//         };
//       }
      
//     }
//   } catch {
//     // optional — ignore
//   }
//   next();
// };

// module.exports.authenticate = authenticate;
// module.exports.optionalAuth = optionalAuth;
