const { query } = require("../config/db");
const { generateSlug } = require("../helpers/slugHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const getOffers = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || "";
    const type = req.query.type || "";

    let whereClause = "WHERE o.store_id = ?";
    const params = [storeId];
    if (status) { whereClause += " AND o.status = ?"; params.push(status); }
    if (type) { whereClause += " AND o.type = ?"; params.push(type); }

    const countResult = await query(`SELECT COUNT(*) as total FROM offers o ${whereClause}`, params);
    const total = countResult[0].total;
    const offers = await query(`SELECT o.* FROM offers o ${whereClause} ORDER BY o.priority DESC, o.created_at DESC LIMIT ? OFFSET ?`, [...params, String(limit), String(offset)]);
    return paginatedResponse(res, offers, total, page, limit);
  } catch (error) {
    logger.error("Get offers error:", error);
    return errorResponse(res, "Failed to fetch offers", 500);
  }
};

const getOffer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const offers = await query("SELECT * FROM offers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!offers.length) return errorResponse(res, "Offer not found", 404);
    return successResponse(res, offers[0]);
  } catch (error) {
    logger.error("Get offer error:", error);
    return errorResponse(res, "Failed to fetch offer", 500);
  }
};

const createOffer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { title, type, discount_type, discount_value, applicable_on, minimum_purchase, maximum_discount, start_date, end_date, is_featured, priority, status } = req.body;
    const slug = generateSlug(title);
    const existing = await query("SELECT id FROM offers WHERE slug = ? AND store_id = ?", [slug, storeId]);
    const finalSlug = existing.length ? `${slug}-${Date.now()}` : slug;

    const result = await query(
      "INSERT INTO offers (store_id, title, slug, type, discount_type, discount_value, applicable_on, minimum_purchase, maximum_discount, start_date, end_date, is_featured, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [storeId, title, finalSlug, type, discount_type || "percentage", discount_value, applicable_on ? JSON.stringify(applicable_on) : null, minimum_purchase || 0, maximum_discount || 0, start_date, end_date, is_featured || 0, priority || 0, status || "active"]
    );
    const offer = await query("SELECT * FROM offers WHERE id = ? AND store_id = ?", [result.insertId, storeId]);
    return successResponse(res, offer[0], "Offer created successfully", 201);
  } catch (error) {
    logger.error("Create offer error:", error);
    return errorResponse(res, "Failed to create offer", 500);
  }
};

const updateOffer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { title, type, discount_type, discount_value, applicable_on, minimum_purchase, maximum_discount, start_date, end_date, is_featured, priority, status } = req.body;
    const existing = await query("SELECT * FROM offers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Offer not found", 404);
    await query(
      "UPDATE offers SET title = ?, type = ?, discount_type = ?, discount_value = ?, applicable_on = ?, minimum_purchase = ?, maximum_discount = ?, start_date = ?, end_date = ?, is_featured = ?, priority = ?, status = ? WHERE id = ? AND store_id = ?",
      [title || existing[0].title, type || existing[0].type, discount_type || existing[0].discount_type, discount_value || existing[0].discount_value, applicable_on ? JSON.stringify(applicable_on) : existing[0].applicable_on, minimum_purchase !== undefined ? minimum_purchase : existing[0].minimum_purchase, maximum_discount !== undefined ? maximum_discount : existing[0].maximum_discount, start_date || existing[0].start_date, end_date || existing[0].end_date, is_featured !== undefined ? is_featured : existing[0].is_featured, priority !== undefined ? priority : existing[0].priority, status || existing[0].status, req.params.id, storeId]
    );
    return successResponse(res, null, "Offer updated successfully");
  } catch (error) {
    logger.error("Update offer error:", error);
    return errorResponse(res, "Failed to update offer", 500);
  }
};

const deleteOffer = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM offers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Offer not found", 404);

    await query("DELETE FROM offers WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Offer deleted");
  } catch (error) {
    logger.error("Delete offer error:", error);
    return errorResponse(res, "Failed to delete offer", 500);
  }
};

const getOfferAnalytics = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const [active] = await query("SELECT COUNT(*) as total FROM offers WHERE store_id = ? AND status = 'active' AND start_date <= NOW() AND end_date >= NOW()", [storeId]);
    const [scheduled] = await query("SELECT COUNT(*) as total FROM offers WHERE store_id = ? AND status = 'scheduled'", [storeId]);
    const [expired] = await query("SELECT COUNT(*) as total FROM offers WHERE store_id = ? AND (status = 'expired' OR end_date < NOW())", [storeId]);
    return successResponse(res, { active: active[0].total, scheduled: scheduled[0].total, expired: expired[0].total });
  } catch (error) {
    logger.error("Offer analytics error:", error);
    return errorResponse(res, "Failed to fetch analytics", 500);
  }
};

module.exports.getOffers = getOffers;
module.exports.getOffer = getOffer;
module.exports.createOffer = createOffer;
module.exports.updateOffer = updateOffer;
module.exports.deleteOffer = deleteOffer;
module.exports.getOfferAnalytics = getOfferAnalytics;
