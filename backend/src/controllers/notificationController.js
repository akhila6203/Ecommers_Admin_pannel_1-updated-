const { query } = require("../config/db");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const getNotifications = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const type = req.query.type || "";
    const is_read = req.query.is_read || "";

    let whereClause = "WHERE n.store_id = ? AND (n.recipient_type = 'all' OR (n.recipient_type = 'admin' AND n.recipient_id IS NULL) OR (n.recipient_type = 'specific' AND n.recipient_id = ?))";
    const params = [storeId, req.admin?.id || null];

    if (type) { whereClause += " AND n.type = ?"; params.push(type); }
    if (is_read !== "") { whereClause += " AND n.is_read = ?"; params.push(is_read === "true" || is_read === "1" ? 1 : 0); }

    const countResult = await query(`SELECT COUNT(*) as total FROM notifications n ${whereClause}`, params);
    const total = countResult[0].total;

    const notifications = await query(
      `SELECT n.* FROM notifications n ${whereClause} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, notifications, total, page, limit);
  } catch (error) {
    logger.error("Get notifications error:", error);
    return errorResponse(res, "Failed to fetch notifications", 500);
  }
};

const markAsRead = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    await query(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND store_id = ?",
      [req.params.id, storeId]
    );
    return successResponse(res, null, "Notification marked as read");
  } catch (error) {
    logger.error("Mark as read error:", error);
    return errorResponse(res, "Failed to mark notification as read", 500);
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    await query(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE store_id = ? AND (recipient_type = 'all' OR recipient_type = 'admin') AND is_read = 0",
      [storeId]
    );
    return successResponse(res, null, "All notifications marked as read");
  } catch (error) {
    logger.error("Mark all as read error:", error);
    return errorResponse(res, "Failed to mark notifications as read", 500);
  }
};

const sendNotification = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { type, title, message, data, channel, recipient_type, recipient_id } = req.body;

    if (!title || !message) {
      return errorResponse(res, "Title and message are required", 400);
    }

    const result = await query(
      "INSERT INTO notifications (store_id, type, title, message, data, channel, recipient_type, recipient_id, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
      [storeId, type || "general", title, message, data ? JSON.stringify(data) : null, channel || "in_app", recipient_type || "all", recipient_id || null]
    );

    const notification = await query("SELECT * FROM notifications WHERE id = ? AND store_id = ?", [result.insertId, storeId]);
    return successResponse(res, notification[0], "Notification sent", 201);
  } catch (error) {
    logger.error("Send notification error:", error);
    return errorResponse(res, "Failed to send notification", 500);
  }
};

const deleteNotification = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    await query("DELETE FROM notifications WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Notification deleted");
  } catch (error) {
    logger.error("Delete notification error:", error);
    return errorResponse(res, "Failed to delete notification", 500);
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const [result] = await query(
      "SELECT COUNT(*) as count FROM notifications WHERE store_id = ? AND (recipient_type = 'all' OR recipient_type = 'admin') AND is_read = 0",
      [storeId]
    );
    return successResponse(res, { unread_count: result[0].count });
  } catch (error) {
    logger.error("Unread count error:", error);
    return errorResponse(res, "Failed to get unread count", 500);
  }
};

const getEmailTemplates = async (req, res) => {
  try {
    const templates = await query("SELECT * FROM email_templates ORDER BY name ASC");
    return successResponse(res, templates);
  } catch (error) {
    logger.error("Get templates error:", error);
    return errorResponse(res, "Failed to fetch email templates", 500);
  }
};

const updateEmailTemplate = async (req, res) => {
  try {
    const { subject, body, variables } = req.body;
    await query(
      "UPDATE email_templates SET subject = COALESCE(?, subject), body = COALESCE(?, body), variables = COALESCE(?, variables) WHERE id = ?",
      [subject || null, body || null, variables ? JSON.stringify(variables) : null, req.params.id]
    );
    return successResponse(res, null, "Email template updated");
  } catch (error) {
    logger.error("Update template error:", error);
    return errorResponse(res, "Failed to update email template", 500);
  }
};

module.exports.getNotifications = getNotifications;
module.exports.markAsRead = markAsRead;
module.exports.markAllAsRead = markAllAsRead;
module.exports.sendNotification = sendNotification;
module.exports.deleteNotification = deleteNotification;
module.exports.getUnreadCount = getUnreadCount;
module.exports.getEmailTemplates = getEmailTemplates;
module.exports.updateEmailTemplate = updateEmailTemplate;
