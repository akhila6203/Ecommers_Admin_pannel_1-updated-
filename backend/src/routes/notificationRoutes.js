const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getNotifications, markAsRead, markAllAsRead, sendNotification,
  deleteNotification, getUnreadCount, getEmailTemplates, updateEmailTemplate,
} = require("../controllers/notificationController");
const router = express.Router();

router.get("/unread-count", authenticate, authorize("super_admin", "admin", "manager", "staff"), getUnreadCount);
router.get("/templates", authenticate, authorize("super_admin", "admin"), getEmailTemplates);
router.put("/templates/:id", authenticate, authorize("super_admin", "admin"), updateEmailTemplate);
router.put("/read-all", authenticate, authorize("super_admin", "admin", "manager", "staff"), markAllAsRead);
router.get("/", authenticate, authorize("super_admin", "admin", "manager", "staff"), getNotifications);
router.put("/:id/read", authenticate, authorize("super_admin", "admin", "manager", "staff"), markAsRead);
router.post("/", authenticate, authorize("super_admin", "admin"), sendNotification);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteNotification);

module.exports = router;