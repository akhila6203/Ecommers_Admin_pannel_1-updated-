const express = require("express");
const { authenticate, optionalAuth } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const { getBanners, getBanner, createBanner, updateBanner, deleteBanner } = require("../controllers/bannerController");

const router = express.Router();

router.get("/", optionalAuth, getBanners);
router.get("/:id", optionalAuth, getBanner);

router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  createBanner
);

router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  updateBanner
);

router.delete(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  deleteBanner
);

module.exports = router;

// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const { getBanners, getBanner, createBanner, updateBanner, deleteBanner } = require("../controllers/bannerController");
// const router = express.Router();

// router.get("/", getBanners);
// router.get("/:id", getBanner);
// router.post("/", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, createBanner);
// router.put("/:id", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, updateBanner);
// router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteBanner);

// module.exports = router;