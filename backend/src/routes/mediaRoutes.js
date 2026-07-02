const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const {
  getMedia, uploadMedia, uploadMultipleMedia, updateMedia, deleteMedia, getMediaFolders,
} = require("../controllers/mediaController");
const router = express.Router();

router.get("/folders", authenticate, authorize("super_admin", "admin", "manager"), getMediaFolders);
router.get("/", authenticate, authorize("super_admin", "admin", "manager"), getMedia);
router.post("/upload", authenticate, authorize("super_admin", "admin", "manager"), upload.single("file"), uploadErrorHandler, uploadMedia);
router.post("/upload-multiple", authenticate, authorize("super_admin", "admin", "manager"), upload.array("files", 20), uploadErrorHandler, uploadMultipleMedia);
router.put("/:id", authenticate, authorize("super_admin", "admin", "manager"), updateMedia);
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteMedia);

module.exports = router;