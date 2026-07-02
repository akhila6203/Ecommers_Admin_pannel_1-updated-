const { query } = require("../config/db");
const logger = require("../config/logger");
const auditLog = (action, entity) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async function (body) {
      try {
        if (req.admin) {
          await query(
            "INSERT INTO audit_logs (admin_id, action, entity, entity_id, details, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
            [
              req.admin.id,
              action,
              entity,
              req.params.id || body?.data?.id || null,
              JSON.stringify({ body: req.body, params: req.params, query: req.query }),
              req.ip,
              req.headers["user-agent"] || null,
              
            ]
          );
        }
      } catch (error) {
        logger.error("Audit log error:", error);
      }
      return originalJson(body);
    };
    next();
  };
};

const activityLog = async (adminId, action, description) => {
  try {
    await query(
      "INSERT INTO activity_logs (admin_id, action, description, created_at) VALUES (?, ?, ?, NOW())",
      [adminId, action, description]
    );
  } catch (error) {
    logger.error("Activity log error:", error);
  }
};

module.exports.auditLog = auditLog;
module.exports.activityLog = activityLog;
