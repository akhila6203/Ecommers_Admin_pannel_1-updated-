const { query } = require("../config/db");
const { generateSlug, generateUniqueSlug } = require("../helpers/slugHelper");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const STORE_COLUMNS = "id, name, slug, domain, status, created_at, updated_at";

const checkStoreSlug = async (slug, excludeId = null) => {
  let sql = "SELECT id FROM stores WHERE slug = ?";
  const params = [slug];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.length > 0 ? result[0] : null;
};

const getStores = async (req, res) => {
  try {
    const stores = await query(
      `SELECT ${STORE_COLUMNS} FROM stores ORDER BY id ASC`
    );
    return successResponse(res, stores);
  } catch (error) {
    logger.error("Get stores error:", error);
    return errorResponse(res, "Failed to fetch stores", 500);
  }
};

const getStore = async (req, res) => {
  try {
    const stores = await query(
      `SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`,
      [req.params.id]
    );
    if (!stores.length) return errorResponse(res, "Store not found", 404);
    return successResponse(res, stores[0]);
  } catch (error) {
    logger.error("Get store error:", error);
    return errorResponse(res, "Failed to fetch store", 500);
  }
};

const createStore = async (req, res) => {
  try {
    const { name, slug: slugInput, domain, status } = req.body;
    if (!name?.trim()) return errorResponse(res, "Store name is required", 400);

    const slug = slugInput?.trim()
      ? await generateUniqueSlug(checkStoreSlug, slugInput.trim())
      : await generateUniqueSlug(checkStoreSlug, name.trim());

    const result = await query(
      "INSERT INTO stores (name, slug, domain, status) VALUES (?, ?, ?, ?)",
      [name.trim(), slug, domain?.trim() || null, status || "active"]
    );

    const store = await query(`SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`, [result.insertId]);

    await query(
      "INSERT INTO store_settings (store_id, company_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE company_name = VALUES(company_name)",
      [result.insertId, name.trim()]
    );
    await query(
      "INSERT INTO integration_settings (store_id) VALUES (?) ON DUPLICATE KEY UPDATE store_id = VALUES(store_id)",
      [result.insertId]
    );

    return successResponse(res, store[0], "Store created successfully", 201);
  } catch (error) {
    logger.error("Create store error:", error);
    return errorResponse(res, "Failed to create store", 500);
  }
};

const updateStore = async (req, res) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    const existing = await query(`SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`, [storeId]);
    if (!existing.length) return errorResponse(res, "Store not found", 404);

    const { name, slug: slugInput, domain, status } = req.body;
    let slug = existing[0].slug;
    if (slugInput?.trim() && slugInput.trim() !== existing[0].slug) {
      slug = await generateUniqueSlug(checkStoreSlug, slugInput.trim(), storeId);
    } else if (name?.trim() && name.trim() !== existing[0].name && !slugInput) {
      slug = await generateUniqueSlug(checkStoreSlug, name.trim(), storeId);
    }

    await query(
      "UPDATE stores SET name = ?, slug = ?, domain = ?, status = ? WHERE id = ?",
      [
        name?.trim() || existing[0].name,
        slug,
        domain !== undefined ? (domain?.trim() || null) : existing[0].domain,
        status || existing[0].status,
        storeId,
      ]
    );

    const store = await query(`SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`, [storeId]);
    return successResponse(res, store[0], "Store updated successfully");
  } catch (error) {
    logger.error("Update store error:", error);
    return errorResponse(res, "Failed to update store", 500);
  }
};

const deleteStore = async (req, res) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (storeId === 1) {
      return errorResponse(res, "Default store cannot be deleted", 400);
    }

    const existing = await query("SELECT id FROM stores WHERE id = ?", [storeId]);
    if (!existing.length) return errorResponse(res, "Store not found", 404);

    await query("DELETE FROM stores WHERE id = ?", [storeId]);
    return successResponse(res, null, "Store deleted");
  } catch (error) {
    logger.error("Delete store error:", error);
    return errorResponse(res, "Failed to delete store", 500);
  }
};

const getCurrentStore = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const stores = await query(`SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`, [storeId]);
    if (!stores.length) return errorResponse(res, "Store not found", 404);
    return successResponse(res, stores[0]);
  } catch (error) {
    logger.error("Get current store error:", error);
    return errorResponse(res, "Failed to fetch store", 500);
  }
};

module.exports.getStores = getStores;
module.exports.getStore = getStore;
module.exports.createStore = createStore;
module.exports.updateStore = updateStore;
module.exports.deleteStore = deleteStore;
module.exports.getCurrentStore = getCurrentStore;
