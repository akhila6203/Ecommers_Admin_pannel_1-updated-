import { query } from "../config/db.js";
import { successResponse, errorResponse, paginatedResponse } from "../helpers/responseHelper.js";
import { hashPassword } from "../helpers/passwordHelper.js";
import logger from "../config/logger.js";

// @desc    Get all admins
// @route   GET /api/admin
export const getAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";
    const role = req.query.role || "";

    let whereClause = "WHERE a.deleted_at IS NULL";
    const params = [];

    if (search) {
      whereClause += " AND (a.name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { whereClause += " AND a.status = ?"; params.push(status); }
    if (role) { whereClause += " AND a.role = ?"; params.push(role); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM admins a ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const admins = await query(
      `SELECT a.id, a.store_id,a.name, a.email, a.phone, a.role, a.status, a.avatar,
        a.last_login_at, a.created_at, r.name as role_name
       FROM admins a
       LEFT JOIN roles r ON a.role_id = r.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, admins, total, page, limit);
  } catch (error) {
    logger.error("Get admins error:", error);
    return errorResponse(res, "Failed to fetch admins", 500);
  }
};

// @desc    Get single admin
// @route   GET /api/admin/:id
export const getAdmin = async (req, res) => {
  try {
    const admins = await query(
      "SELECT id, store_id, name, email, phone, role, status, avatar, last_login_at, created_at FROM admins WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!admins.length) return errorResponse(res, "Admin not found", 404);
    return successResponse(res, admins[0]);
  } catch (error) {
    logger.error("Get admin error:", error);
    return errorResponse(res, "Failed to fetch admin", 500);
  }
};

// @desc    Create admin
// @route   POST /api/admin
export const createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone, role, role_id, status, store_id } = req.body;

    if (!name || !email || !password) {
      return errorResponse(res, "Name, email, and password are required", 400);
    }

    const existing = await query("SELECT id FROM admins WHERE email = ? AND deleted_at IS NULL", [email]);
    if (existing.length) return errorResponse(res, "Email already in use", 409);

    const hashedPassword = await hashPassword(password);
    const avatar = req.file ? `uploads/admins/${req.file.filename}` : null;

    const result = await query(
      "INSERT INTO admins (store_id, name, email, password, phone, role, role_id, avatar, status)VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
  role === "super_admin" ? null : Number(store_id || 1),
  name,
  email,
  hashedPassword,
  phone || null,
  role || "staff",
  role_id || null,
  avatar,
  status || "active",
]
 
      // "INSERT INTO admins (name, email, password, phone, role, role_id, avatar, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      // [name, email, hashedPassword, phone || null, role || "staff", role_id || null, avatar, status || "active"]
    );

    const admin = await query(
      "SELECT id, store_id,name, email, phone, role, status, avatar, created_at FROM admins WHERE id = ?",
      [result.insertId]
    );
    return successResponse(res, admin[0], "Admin created successfully", 201);
  } catch (error) {
    logger.error("Create admin error:", error);
    return errorResponse(res, "Failed to create admin", 500);
  }
};

// @desc    Update admin
// @route   PUT /api/admin/:id
export const updateAdmin = async (req, res) => {
  try {
    const existing = await query("SELECT * FROM admins WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
    if (!existing.length) return errorResponse(res, "Admin not found", 404);

    const { name, email, password, phone, role, role_id, status, store_id  } = req.body;
    const avatar = req.file ? `uploads/admins/${req.file.filename}` : existing[0].avatar;

    // Check email uniqueness
    if (email && email !== existing[0].email) {
      const dup = await query("SELECT id FROM admins WHERE email = ? AND id != ? AND deleted_at IS NULL", [email, req.params.id]);
      if (dup.length) return errorResponse(res, "Email already in use", 409);
    }

    let passwordClause = "";
    const updateParams = [];
    if (password) {
      const hashedPassword = await hashPassword(password);
      passwordClause = ", password = ?";
      updateParams.push(hashedPassword);
    }

    await query(
      `UPDATE admins SET store_id = ?, name = ?, email = ?, phone = ?, role = ?, role_id = ?, avatar = ?, status = ?${passwordClause} WHERE id = ?`,
      // `UPDATE admins SET name = ?, email = ?, phone = ?, role = ?, role_id = ?, avatar = ?, status = ?${passwordClause} WHERE id = ?`,
      [
  role === "super_admin" ? null : Number(store_id || existing[0].store_id || 1),
  name || existing[0].name,
  email || existing[0].email,
  phone !== undefined ? phone : existing[0].phone,
  role || existing[0].role,
  role_id !== undefined ? role_id : existing[0].role_id,
  avatar,
  status || existing[0].status,
  ...updateParams,
  req.params.id,
]
    );

    return successResponse(res, null, "Admin updated successfully");
  } catch (error) {
    logger.error("Update admin error:", error);
    return errorResponse(res, "Failed to update admin", 500);
  }
};

// @desc    Delete admin (soft)
// @route   DELETE /api/admin/:id
export const deleteAdmin = async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.admin?.id) {
      return errorResponse(res, "You cannot delete yourself", 400);
    }
    await query("UPDATE admins SET deleted_at = NOW() WHERE id = ?", [req.params.id]);
    return successResponse(res, null, "Admin deleted");
  } catch (error) {
    logger.error("Delete admin error:", error);
    return errorResponse(res, "Failed to delete admin", 500);
  }
};

// @desc    Get all roles
// @route   GET /api/admin/roles
export const getRoles = async (req, res) => {
  try {
    const roles = await query("SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY id ASC");
    return successResponse(res, roles);
  } catch (error) {
    logger.error("Get roles error:", error);
    return errorResponse(res, "Failed to fetch roles", 500);
  }
};

// @desc    Create role
// @route   POST /api/admin/roles
export const createRole = async (req, res) => {
  try {
    const { name, slug, description, permissions } = req.body;
    if (!name || !slug) return errorResponse(res, "Name and slug are required", 400);

    await query(
      "INSERT INTO roles (name, slug, description, permissions) VALUES (?, ?, ?, ?)",
      [name, slug, description || null, permissions ? JSON.stringify(permissions) : null]
    );
    return successResponse(res, null, "Role created successfully", 201);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return errorResponse(res, "Role slug already exists", 409);
    logger.error("Create role error:", error);
    return errorResponse(res, "Failed to create role", 500);
  }
};

// @desc    Update role
// @route   PUT /api/admin/roles/:id
export const updateRole = async (req, res) => {
  try {
    const { name, description, permissions, status } = req.body;
    await query(
      "UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), permissions = COALESCE(?, permissions), status = COALESCE(?, status) WHERE id = ?",
      [name || null, description !== undefined ? description : null, permissions ? JSON.stringify(permissions) : null, status || null, req.params.id]
    );
    return successResponse(res, null, "Role updated");
  } catch (error) {
    logger.error("Update role error:", error);
    return errorResponse(res, "Failed to update role", 500);
  }
};

// @desc    Delete role
// @route   DELETE /api/admin/roles/:id
export const deleteRole = async (req, res) => {
  try {
    const adminsWithRole = await query("SELECT COUNT(*) as count FROM admins WHERE role_id = ? AND deleted_at IS NULL", [req.params.id]);
    if (adminsWithRole[0].count > 0) {
      return errorResponse(res, "Cannot delete role with assigned admins", 400);
    }
    await query("UPDATE roles SET deleted_at = NOW() WHERE id = ?", [req.params.id]);
    return successResponse(res, null, "Role deleted");
  } catch (error) {
    logger.error("Delete role error:", error);
    return errorResponse(res, "Failed to delete role", 500);
  }
};

// @desc    Get permissions list
// @route   GET /api/admin/permissions
export const getPermissions = async (req, res) => {
  try {
    const permissions = await query("SELECT * FROM permissions ORDER BY module, name ASC");
    return successResponse(res, permissions);
  } catch (error) {
    logger.error("Get permissions error:", error);
    return errorResponse(res, "Failed to fetch permissions", 500);
  }
};


// import { query } from "../config/db.js";
// import { successResponse, errorResponse, paginatedResponse } from "../helpers/responseHelper.js";
// import { hashPassword } from "../helpers/passwordHelper.js";
// import logger from "../config/logger.js";

// // @desc    Get all admins
// // @route   GET /api/admin
// export const getAdmins = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const offset = (page - 1) * limit;
//     const search = req.query.search || "";
//     const status = req.query.status || "";
//     const role = req.query.role || "";

//     let whereClause = "WHERE a.deleted_at IS NULL";
//     const params = [];

//     if (search) {
//       whereClause += " AND (a.name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)";
//       params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//     }
//     if (status) { whereClause += " AND a.status = ?"; params.push(status); }
//     if (role) { whereClause += " AND a.role = ?"; params.push(role); }

//     const countResult = await query(
//       `SELECT COUNT(*) as total FROM admins a ${whereClause}`,
//       params
//     );
//     const total = countResult[0].total;

//     const admins = await query(
//       `SELECT a.id, a.name, a.email, a.phone, a.role, a.status, a.avatar,
//         a.last_login_at, a.created_at, r.name as role_name
//        FROM admins a
//        LEFT JOIN roles r ON a.role_id = r.id
//        ${whereClause}
//        ORDER BY a.created_at DESC
//        LIMIT ? OFFSET ?`,
//       [...params, String(limit), String(offset)]
//     );

//     return paginatedResponse(res, admins, total, page, limit);
//   } catch (error) {
//     logger.error("Get admins error:", error);
//     return errorResponse(res, "Failed to fetch admins", 500);
//   }
// };

// // @desc    Get single admin
// // @route   GET /api/admin/:id
// export const getAdmin = async (req, res) => {
//   try {
//     const admins = await query(
//       "SELECT id, name, email, phone, role, status, avatar, last_login_at, created_at FROM admins WHERE id = ? AND deleted_at IS NULL",
//       [req.params.id]
//     );
//     if (!admins.length) return errorResponse(res, "Admin not found", 404);
//     return successResponse(res, admins[0]);
//   } catch (error) {
//     logger.error("Get admin error:", error);
//     return errorResponse(res, "Failed to fetch admin", 500);
//   }
// };

// // @desc    Create admin
// // @route   POST /api/admin
// export const createAdmin = async (req, res) => {
//   try {
//     const { name, email, password, phone, role, role_id, status } = req.body;

//     if (!name || !email || !password) {
//       return errorResponse(res, "Name, email, and password are required", 400);
//     }

//     const existing = await query("SELECT id FROM admins WHERE email = ? AND deleted_at IS NULL", [email]);
//     if (existing.length) return errorResponse(res, "Email already in use", 409);

//     const hashedPassword = await hashPassword(password);
//     const avatar = req.file ? `uploads/admins/${req.file.filename}` : null;

//     const result = await query(
//       "INSERT INTO admins (name, email, password, phone, role, role_id, avatar, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
//       [name, email, hashedPassword, phone || null, role || "staff", role_id || null, avatar, status || "active"]
//     );

//     const admin = await query(
//       "SELECT id, name, email, phone, role, status, avatar, created_at FROM admins WHERE id = ?",
//       [result.insertId]
//     );
//     return successResponse(res, admin[0], "Admin created successfully", 201);
//   } catch (error) {
//     logger.error("Create admin error:", error);
//     return errorResponse(res, "Failed to create admin", 500);
//   }
// };

// // @desc    Update admin
// // @route   PUT /api/admin/:id
// export const updateAdmin = async (req, res) => {
//   try {
//     const existing = await query("SELECT * FROM admins WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
//     if (!existing.length) return errorResponse(res, "Admin not found", 404);

//     const { name, email, password, phone, role, role_id, status } = req.body;
//     const avatar = req.file ? `uploads/admins/${req.file.filename}` : existing[0].avatar;

//     // Check email uniqueness
//     if (email && email !== existing[0].email) {
//       const dup = await query("SELECT id FROM admins WHERE email = ? AND id != ? AND deleted_at IS NULL", [email, req.params.id]);
//       if (dup.length) return errorResponse(res, "Email already in use", 409);
//     }

//     let passwordClause = "";
//     const updateParams = [];
//     if (password) {
//       const hashedPassword = await hashPassword(password);
//       passwordClause = ", password = ?";
//       updateParams.push(hashedPassword);
//     }

//     await query(
//       `UPDATE admins SET name = ?, email = ?, phone = ?, role = ?, role_id = ?, avatar = ?, status = ?${passwordClause} WHERE id = ?`,
//       [name || existing[0].name, email || existing[0].email, phone !== undefined ? phone : existing[0].phone,
//        role || existing[0].role, role_id !== undefined ? role_id : existing[0].role_id,
//        avatar, status || existing[0].status, ...updateParams, req.params.id]
//     );

//     return successResponse(res, null, "Admin updated successfully");
//   } catch (error) {
//     logger.error("Update admin error:", error);
//     return errorResponse(res, "Failed to update admin", 500);
//   }
// };

// // @desc    Delete admin (soft)
// // @route   DELETE /api/admin/:id
// export const deleteAdmin = async (req, res) => {
//   try {
//     if (parseInt(req.params.id) === req.admin?.id) {
//       return errorResponse(res, "You cannot delete yourself", 400);
//     }
//     await query("UPDATE admins SET deleted_at = NOW() WHERE id = ?", [req.params.id]);
//     return successResponse(res, null, "Admin deleted");
//   } catch (error) {
//     logger.error("Delete admin error:", error);
//     return errorResponse(res, "Failed to delete admin", 500);
//   }
// };

// // @desc    Get all roles
// // @route   GET /api/admin/roles
// export const getRoles = async (req, res) => {
//   try {
//     const roles = await query("SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY id ASC");
//     return successResponse(res, roles);
//   } catch (error) {
//     logger.error("Get roles error:", error);
//     return errorResponse(res, "Failed to fetch roles", 500);
//   }
// };

// // @desc    Create role
// // @route   POST /api/admin/roles
// export const createRole = async (req, res) => {
//   try {
//     const { name, slug, description, permissions } = req.body;
//     if (!name || !slug) return errorResponse(res, "Name and slug are required", 400);

//     await query(
//       "INSERT INTO roles (name, slug, description, permissions) VALUES (?, ?, ?, ?)",
//       [name, slug, description || null, permissions ? JSON.stringify(permissions) : null]
//     );
//     return successResponse(res, null, "Role created successfully", 201);
//   } catch (error) {
//     if (error.code === "ER_DUP_ENTRY") return errorResponse(res, "Role slug already exists", 409);
//     logger.error("Create role error:", error);
//     return errorResponse(res, "Failed to create role", 500);
//   }
// };

// // @desc    Update role
// // @route   PUT /api/admin/roles/:id
// export const updateRole = async (req, res) => {
//   try {
//     const { name, description, permissions, status } = req.body;
//     await query(
//       "UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), permissions = COALESCE(?, permissions), status = COALESCE(?, status) WHERE id = ?",
//       [name || null, description !== undefined ? description : null, permissions ? JSON.stringify(permissions) : null, status || null, req.params.id]
//     );
//     return successResponse(res, null, "Role updated");
//   } catch (error) {
//     logger.error("Update role error:", error);
//     return errorResponse(res, "Failed to update role", 500);
//   }
// };

// // @desc    Delete role
// // @route   DELETE /api/admin/roles/:id
// export const deleteRole = async (req, res) => {
//   try {
//     const adminsWithRole = await query("SELECT COUNT(*) as count FROM admins WHERE role_id = ? AND deleted_at IS NULL", [req.params.id]);
//     if (adminsWithRole[0].count > 0) {
//       return errorResponse(res, "Cannot delete role with assigned admins", 400);
//     }
//     await query("UPDATE roles SET deleted_at = NOW() WHERE id = ?", [req.params.id]);
//     return successResponse(res, null, "Role deleted");
//   } catch (error) {
//     logger.error("Delete role error:", error);
//     return errorResponse(res, "Failed to delete role", 500);
//   }
// };

// // @desc    Get permissions list
// // @route   GET /api/admin/permissions
// export const getPermissions = async (req, res) => {
//   try {
//     const permissions = await query("SELECT * FROM permissions ORDER BY module, name ASC");
//     return successResponse(res, permissions);
//   } catch (error) {
//     logger.error("Get permissions error:", error);
//     return errorResponse(res, "Failed to fetch permissions", 500);
//   }
// };