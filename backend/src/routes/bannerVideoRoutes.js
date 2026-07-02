const express = require("express");
const { authenticate, optionalAuth } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { videoUpload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const {
  getBannerVideos,
  getBannerVideo,
  createBannerVideo,
  updateBannerVideo,
  deleteBannerVideo,
} = require("../controllers/bannerVideoController");

const router = express.Router();

router.get("/", optionalAuth, getBannerVideos);
router.get("/:id", optionalAuth, getBannerVideo);

router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  videoUpload.single("video"),
  uploadErrorHandler,
  createBannerVideo
);

router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  videoUpload.single("video"),
  uploadErrorHandler,
  updateBannerVideo
);

router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteBannerVideo);

module.exports = router;

// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { videoUpload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const {
//   getBannerVideos,
//   getBannerVideo,
//   createBannerVideo,
//   updateBannerVideo,
//   deleteBannerVideo,
// } = require("../controllers/bannerVideoController");
// const router = express.Router();

// router.get("/", getBannerVideos);
// router.get("/:id", getBannerVideo);
// router.post(
//   "/",
//   authenticate,
//   authorize("super_admin", "admin"),
//   videoUpload.single("video"),
//   uploadErrorHandler,
//   createBannerVideo
// );
// router.put(
//   "/:id",
//   authenticate,
//   authorize("super_admin", "admin"),
//   videoUpload.single("video"),
//   uploadErrorHandler,
//   updateBannerVideo
// );
// router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteBannerVideo);

// module.exports = router;