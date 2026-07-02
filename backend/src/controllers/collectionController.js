const { query } = require("../config/db");
const { generateSlug } = require("../helpers/slugHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const parseProductIds = (product_ids) => {
  if (product_ids === undefined || product_ids === null || product_ids === "") return [];

  let raw = product_ids;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) raw = parsed;
      else raw = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      raw = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(raw)) return [];
  return raw.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && id > 0);
};

const getCollections = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";

    let whereClause = "WHERE c.store_id = ?";
    const params = [storeId];

    if (search) {
      whereClause += " AND (c.name LIKE ? OR c.description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      whereClause += " AND c.status = ?";
      params.push(status);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM collections c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const collections = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM collection_products WHERE collection_id = c.id AND store_id = ?) as product_count
       FROM collections c
       ${whereClause}
       ORDER BY c.sort_order ASC, c.created_at DESC
       LIMIT ? OFFSET ?`,
      [storeId, ...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, collections, total, page, limit);
  } catch (error) {
    logger.error("Get collections error:", error);
    return errorResponse(res, "Failed to fetch collections", 500);
  }
};

const getCollection = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const collections = await query(
      "SELECT * FROM collections WHERE id = ? AND store_id = ?",
      [req.params.id, storeId]
    );
    if (!collections.length) return errorResponse(res, "Collection not found", 404);

    const collection = collections[0];
    collection.products = await query(
      `SELECT cp.sort_order, p.id, p.name, p.slug, p.price, p.offer_price, p.thumbnail, p.stock, p.stock_status, p.status
       FROM collection_products cp
       JOIN products p ON cp.product_id = p.id AND p.store_id = cp.store_id
       WHERE cp.collection_id = ? AND cp.store_id = ?
       ORDER BY cp.sort_order ASC`,
      [collection.id, storeId]
    );

    return successResponse(res, collection);
  } catch (error) {
    logger.error("Get collection error:", error);
    return errorResponse(res, "Failed to fetch collection", 500);
  }
};

const createCollection = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, description, label, type, sort_order, status, meta_title, meta_description, product_ids } = req.body;
    if (!name?.trim()) return errorResponse(res, "Collection name is required", 400);

    const slug = generateSlug(name);
    const existing = await query("SELECT id FROM collections WHERE slug = ? AND store_id = ?", [slug, storeId]);
    const finalSlug = existing.length ? `${slug}-${Date.now()}` : slug;

    const image = req.files?.image ? `uploads/collections/${req.files.image[0].filename}` : null;
    const banner = req.files?.banner ? `uploads/collections/${req.files.banner[0].filename}` : null;

    const result = await query(
      `INSERT INTO collections (store_id, name, slug, label, description, image, banner, type, sort_order, status, meta_title, meta_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        name.trim(),
        finalSlug,
        label?.trim() || "",
        description || null,
        image,
        banner,
        type || null,
        sort_order !== undefined ? parseInt(sort_order, 10) || 0 : 0,
        status || "active",
        meta_title || null,
        meta_description || null,
      ]
    );

    const ids = parseProductIds(product_ids);
    if (ids.length) {
      for (let i = 0; i < ids.length; i++) {
        await query(
          "INSERT INTO collection_products (store_id, collection_id, product_id, sort_order) VALUES (?, ?, ?, ?)",
          [storeId, result.insertId, ids[i], i]
        );
      }
    }

    const collection = await query("SELECT * FROM collections WHERE id = ? AND store_id = ?", [result.insertId, storeId]);
    return successResponse(res, collection[0], "Collection created successfully", 201);
  } catch (error) {
    logger.error("Create collection error:", error);
    return errorResponse(res, "Failed to create collection", 500);
  }
};

const updateCollection = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT * FROM collections WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Collection not found", 404);

    const { name, description, label, type, sort_order, status, meta_title, meta_description, product_ids } = req.body;

    let slug = existing[0].slug;
    if (name?.trim() && name.trim() !== existing[0].name) {
      const baseSlug = generateSlug(name);
      const slugCheck = await query("SELECT id FROM collections WHERE slug = ? AND store_id = ? AND id != ?", [baseSlug, storeId, req.params.id]);
      slug = slugCheck.length ? `${baseSlug}-${Date.now()}` : baseSlug;
    }

    const image = req.files?.image ? `uploads/collections/${req.files.image[0].filename}` : existing[0].image;
    const banner = req.files?.banner ? `uploads/collections/${req.files.banner[0].filename}` : existing[0].banner;

    await query(
      `UPDATE collections SET
        name = ?, slug = ?, label = ?, description = ?, image = ?, banner = ?, type = ?,
        sort_order = ?, status = ?, meta_title = ?, meta_description = ?
       WHERE id = ? AND store_id = ?`,
      [
        name !== undefined ? name.trim() : existing[0].name,
        slug,
        label !== undefined ? (label?.trim() || "") : (existing[0].label || ""),
        description !== undefined ? description : existing[0].description,
        image,
        banner,
        type !== undefined ? type : existing[0].type,
        sort_order !== undefined ? parseInt(sort_order, 10) || 0 : existing[0].sort_order,
        status !== undefined ? status : existing[0].status,
        meta_title !== undefined ? meta_title : existing[0].meta_title,
        meta_description !== undefined ? meta_description : existing[0].meta_description,
        req.params.id,
        storeId,
      ]
    );

    if (product_ids !== undefined) {
      const ids = parseProductIds(product_ids);
      await query("DELETE FROM collection_products WHERE collection_id = ? AND store_id = ?", [req.params.id, storeId]);
      for (let i = 0; i < ids.length; i++) {
        await query(
          "INSERT INTO collection_products (store_id, collection_id, product_id, sort_order) VALUES (?, ?, ?, ?)",
          [storeId, req.params.id, ids[i], i]
        );
      }
    }

    const collection = await query("SELECT * FROM collections WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, collection[0], "Collection updated successfully");
  } catch (error) {
    logger.error("Update collection error:", error);
    return errorResponse(res, "Failed to update collection", 500);
  }
};

const deleteCollection = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM collections WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Collection not found", 404);

    await query("DELETE FROM collections WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Collection deleted successfully");
  } catch (error) {
    logger.error("Delete collection error:", error);
    return errorResponse(res, "Failed to delete collection", 500);
  }
};

module.exports.getCollections = getCollections;
module.exports.getCollection = getCollection;
module.exports.createCollection = createCollection;
module.exports.updateCollection = updateCollection;
module.exports.deleteCollection = deleteCollection;
