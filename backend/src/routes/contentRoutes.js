const express = require("express");
const { authenticate ,  optionalAuth} = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const { getContentPage, updateContentPage } = require("../controllers/contentController");

const router = express.Router();

router.get("/:page_key", optionalAuth, getContentPage);
// router.get(
//   "/:page_key",
//   authenticate,
//   authorize("super_admin", "admin", "manager", "staff"),
//   getContentPage
// );

router.put(
  "/:page_key",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  updateContentPage
);

module.exports = router;

// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const { getContentPage, updateContentPage } = require("../controllers/contentController");
// const router = express.Router();

// router.get("/:page_key", getContentPage);
// router.put("/:page_key", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, updateContentPage);

// module.exports = router;