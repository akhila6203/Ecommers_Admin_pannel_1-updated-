const { query } = require("../config/db");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const VIDEO_COLUMNS =
  "id, store_id, title, video_url, video_path, status, sort_order, created_at, updated_at";

const getBannerVideos = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const countResult = await query("SELECT COUNT(*) as total FROM banner_videos WHERE store_id = ?", [storeId]);
    const total = countResult[0].total;

    const videos = await query(
      `SELECT ${VIDEO_COLUMNS} FROM banner_videos WHERE store_id = ? ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?`,
      [storeId, String(limit), String(offset)]
    );

    return paginatedResponse(res, videos, total, page, limit);
  } catch (error) {
    logger.error("Get banner videos error:", error);
    return errorResponse(res, "Failed to fetch banner videos", 500);
  }
};

const getBannerVideo = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const videos = await query(
      `SELECT ${VIDEO_COLUMNS} FROM banner_videos WHERE id = ? AND store_id = ?`,
      [req.params.id, storeId]
    );
    if (!videos.length) return errorResponse(res, "Video not found", 404);
    return successResponse(res, videos[0]);
  } catch (error) {
    logger.error("Get banner video error:", error);
    return errorResponse(res, "Failed to fetch banner video", 500);
  }
};

const createBannerVideo = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { title, video_url, status, sort_order } = req.body;

    if (!title?.trim()) return errorResponse(res, "Video title is required", 400);

    const videoPath = req.file ? `uploads/banner-videos/${req.file.filename}` : null;
    const externalUrl = video_url?.trim() || null;

    if (!videoPath && !externalUrl) {
      return errorResponse(res, "Video file or video URL is required", 400);
    }

    const result = await query(
      `INSERT INTO banner_videos (store_id, title, video_url, video_path, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        title.trim(),
        externalUrl,
        videoPath,
        status || "active",
        sort_order !== undefined ? parseInt(sort_order, 10) || 0 : 0,
      ]
    );

    const video = await query(
      `SELECT ${VIDEO_COLUMNS} FROM banner_videos WHERE id = ? AND store_id = ?`,
      [result.insertId, storeId]
    );

    return successResponse(res, video[0], "Video created successfully", 201);
  } catch (error) {
    logger.error("Create banner video error:", error);
    return errorResponse(res, "Failed to create video", 500);
  }
};

const updateBannerVideo = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query(
      `SELECT * FROM banner_videos WHERE id = ? AND store_id = ?`,
      [req.params.id, storeId]
    );
    if (!existing.length) return errorResponse(res, "Video not found", 404);

    const row = existing[0];
    const { title, video_url, status, sort_order } = req.body;

    const videoPath = req.file ? `uploads/banner-videos/${req.file.filename}` : row.video_path;
    const externalUrl = video_url !== undefined ? (video_url?.trim() || null) : row.video_url;

    if (!videoPath && !externalUrl) {
      return errorResponse(res, "Video file or video URL is required", 400);
    }

    await query(
      `UPDATE banner_videos SET title = ?, video_url = ?, video_path = ?, status = ?, sort_order = ?
       WHERE id = ? AND store_id = ?`,
      [
        title !== undefined ? title.trim() : row.title,
        externalUrl,
        videoPath,
        status !== undefined ? status : row.status,
        sort_order !== undefined ? parseInt(sort_order, 10) || 0 : row.sort_order,
        req.params.id,
        storeId,
      ]
    );

    const video = await query(
      `SELECT ${VIDEO_COLUMNS} FROM banner_videos WHERE id = ? AND store_id = ?`,
      [req.params.id, storeId]
    );

    return successResponse(res, video[0], "Video updated successfully");
  } catch (error) {
    logger.error("Update banner video error:", error);
    return errorResponse(res, "Failed to update video", 500);
  }
};

const deleteBannerVideo = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query(
      "SELECT id FROM banner_videos WHERE id = ? AND store_id = ?",
      [req.params.id, storeId]
    );
    if (!existing.length) return errorResponse(res, "Video not found", 404);

    await query("DELETE FROM banner_videos WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Video deleted successfully");
  } catch (error) {
    logger.error("Delete banner video error:", error);
    return errorResponse(res, "Failed to delete video", 500);
  }
};

module.exports.getBannerVideos = getBannerVideos;
module.exports.getBannerVideo = getBannerVideo;
module.exports.createBannerVideo = createBannerVideo;
module.exports.updateBannerVideo = updateBannerVideo;
module.exports.deleteBannerVideo = deleteBannerVideo;
