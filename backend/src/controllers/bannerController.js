const { query } = require("../config/db");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { normalizeBannerImage } = require("../helpers/imagePathHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const BANNER_COLUMNS =
  "id, title, subtitle, subtitle1, description, button_text, button_link, image, status, sort_order, created_at, updated_at";

const pickText = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
};

const pickBannerFields = (body, existing = {}) => ({
  title: pickText(body.title, existing.title || ""),
  subtitle: pickText(body.subtitle, existing.subtitle || ""),
  subtitle1: pickText(body.subtitle1, existing.subtitle1 || ""),
  description: pickText(body.description, existing.description || ""),
  button_text: pickText(body.button_text, existing.button_text || ""),
  button_link: pickText(body.button_link, existing.button_link || ""),
});

const getBanners = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const countResult = await query("SELECT COUNT(*) as total FROM banners WHERE store_id = ?", [storeId]);
    const total = countResult[0].total;
    const banners = await query(
      `SELECT ${BANNER_COLUMNS} FROM banners WHERE store_id = ? ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?`,
      [storeId, String(limit), String(offset)]
    );
    return paginatedResponse(res, banners.map(normalizeBannerImage), total, page, limit);
  } catch (error) {
    logger.error("Get banners error:", error);
    return errorResponse(res, "Failed to fetch banners", 500);
  }
};

const getBanner = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const banners = await query(
      `SELECT ${BANNER_COLUMNS} FROM banners WHERE id = ? AND store_id = ?`,
      [req.params.id, storeId]
    );
    if (!banners.length) return errorResponse(res, "Banner not found", 404);
    return successResponse(res, normalizeBannerImage(banners[0]));
  } catch (error) {
    logger.error("Get banner error:", error);
    return errorResponse(res, "Failed to fetch banner", 500);
  }
};

const createBanner = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const fields = pickBannerFields(req.body);
    const image = req.file ? `uploads/banners/${req.file.filename}` : req.body.image;

    if (!fields.title) return errorResponse(res, "Banner title is required", 400);
    if (!image) return errorResponse(res, "Banner image is required", 400);

    const result = await query(
      `INSERT INTO banners (store_id, title, subtitle, subtitle1, description, button_text, button_link, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        fields.title,
        fields.subtitle,
        fields.subtitle1,
        fields.description || null,
        fields.button_text,
        fields.button_link,
        image,
      ]
    );
    const banner = await query(
      `SELECT ${BANNER_COLUMNS} FROM banners WHERE id = ? AND store_id = ?`,
      [result.insertId, storeId]
    );
    return successResponse(res, normalizeBannerImage(banner[0]), "Banner created successfully", 201);
  } catch (error) {
    logger.error("Create banner error:", error);
    return errorResponse(res, "Failed to create banner", 500);
  }
};

const updateBanner = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query(
      `SELECT id, title, subtitle, subtitle1, description, button_text, button_link, image FROM banners WHERE id = ? AND store_id = ?`,
      [req.params.id, storeId]
    );
    if (!existing.length) return errorResponse(res, "Banner not found", 404);

    const fields = pickBannerFields(req.body, existing[0]);
    const image = req.file ? `uploads/banners/${req.file.filename}` : existing[0].image;

    await query(
      `UPDATE banners SET title = ?, subtitle = ?, subtitle1 = ?, description = ?, button_text = ?, button_link = ?, image = ?
       WHERE id = ? AND store_id = ?`,
      [
        fields.title,
        fields.subtitle,
        fields.subtitle1,
        fields.description || null,
        fields.button_text,
        fields.button_link,
        image,
        req.params.id,
        storeId,
      ]
    );
    return successResponse(res, null, "Banner updated successfully");
  } catch (error) {
    logger.error("Update banner error:", error);
    return errorResponse(res, "Failed to update banner", 500);
  }
};

const deleteBanner = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM banners WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Banner not found", 404);

    await query("DELETE FROM banners WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Banner deleted");
  } catch (error) {
    logger.error("Delete banner error:", error);
    return errorResponse(res, "Failed to delete banner", 500);
  }
};

module.exports.getBanners = getBanners;
module.exports.getBanner = getBanner;
module.exports.createBanner = createBanner;
module.exports.updateBanner = updateBanner;
module.exports.deleteBanner = deleteBanner;
