const express = require("express");
const { authenticate,optionalAuth } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");

const {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} = require("../controllers/collectionController");

const router = express.Router();

// Get Collections
router.get("/", optionalAuth, getCollections);
router.get("/:id", optionalAuth, getCollection);

// router.get(
//   "/",
//   optionalAuth,
//   authorize("super_admin", "admin", "manager", "staff"),
//   getCollections
// );

// router.get(
//   "/:id",
//   optionalAuth,
//   authorize("super_admin", "admin", "manager", "staff"),
//   getCollection
// );

// Create Collection
router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  uploadErrorHandler,
  createCollection
);

// Update Collection
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  uploadErrorHandler,
  updateCollection
);

// Delete Collection
router.delete(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  deleteCollection
);

module.exports = router;


// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const { getCollections, getCollection, createCollection, updateCollection, deleteCollection } = require("../controllers/collectionController");
// const router = express.Router();

// router.get("/", getCollections);
// router.get("/:id", getCollection);
// // router.get("/", authenticate, authorize("super_admin", "admin", "manager", "staff"), getCollections);
// // router.get("/:id", authenticate, authorize("super_admin", "admin", "manager", "staff"), getCollection);
// router.post("/", authenticate, authorize("super_admin", "admin"), upload.fields([{ name: "image", maxCount: 1 }, { name: "banner", maxCount: 1 }]), uploadErrorHandler, createCollection);
// router.put("/:id", authenticate, authorize("super_admin", "admin"), upload.fields([{ name: "image", maxCount: 1 }, { name: "banner", maxCount: 1 }]), uploadErrorHandler, updateCollection);
// router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteCollection);



// module.exports = router;