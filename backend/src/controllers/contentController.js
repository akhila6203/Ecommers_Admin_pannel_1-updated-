const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const getContentPage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { page_key } = req.params;
    const rows = await query("SELECT * FROM content_pages WHERE page_key = ? AND store_id = ?", [page_key, storeId]);

    if (rows.length > 0) {
      const page = rows[0];
      if (page_key === "contact") {
        try {
          page.content = JSON.parse(page.content);
        } catch (e) {
          page.content = {};
        }
      }
      return successResponse(res, page);
    }

    const defaults = {
      page_key,
      title: "",
      content: page_key === "contact" ? {} : "",
      image: null,
      status: "active",
    };
    return successResponse(res, defaults);
  } catch (error) {
    logger.error(`Get content page error (${req.params.page_key}):`, error);
    return errorResponse(res, "Failed to fetch content page", 500);
  }
};

const updateContentPage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { page_key } = req.params;
    const { title, content, status } = req.body;

    const existing = await query("SELECT image FROM content_pages WHERE page_key = ? AND store_id = ?", [page_key, storeId]);

    let image = existing.length > 0 ? existing[0].image : null;
    if (req.file) {
      image = `uploads/content/${req.file.filename}`;
    } else if (req.body.image === "null" || req.body.image === null || req.body.image === "") {
      image = null;
    }

    const finalContent = typeof content === "object" ? JSON.stringify(content) : content;

    await query(
      `INSERT INTO content_pages (store_id, page_key, title, content, image, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         content = VALUES(content),
         image = VALUES(image),
         status = VALUES(status)`,
      [storeId, page_key, title || null, finalContent || null, image, status || "active"]
    );

    const updated = await query("SELECT * FROM content_pages WHERE page_key = ? AND store_id = ?", [page_key, storeId]);
    const responseData = updated[0];
    if (page_key === "contact") {
      try {
        responseData.content = JSON.parse(responseData.content);
      } catch (e) {
        responseData.content = {};
      }
    }

    return successResponse(res, responseData, `${page_key} page updated successfully`);
  } catch (error) {
    logger.error(`Update content page error (${req.params.page_key}):`, error);
    return errorResponse(res, "Failed to update content page", 500);
  }
};

module.exports.getContentPage = getContentPage;
module.exports.updateContentPage = updateContentPage;
