const express = require("express");
const { authenticate , optionalAuth} = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const { auditLog } = require("../middleware/auditMiddleware");

const {
  validateCategory,
  validateSubCategory,
  validateSubCategoryUpdate,
  validateChildCategory,
  validateChildCategoryUpdate,
} = require("../validators/categoryValidator");

const {
  getCategories,
  getAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  getSubCategories,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  getChildCategories,
  createChildCategory,
  updateChildCategory,
  deleteChildCategory,
  getCategoryHierarchy,
} = require("../controllers/categoryController");

const router = express.Router();

router.get("/hierarchy", optionalAuth, getCategoryHierarchy);
router.get("/all", optionalAuth, getAllCategories);

router.get("/sub/:subId/child", optionalAuth, getChildCategories);
router.get("/:mainId/sub", optionalAuth, getSubCategories);

router.get("/", optionalAuth, getCategories);
router.get("/:id", optionalAuth, getCategory);

router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  validateCategory,
  auditLog("create", "category"),
  createCategory
);

router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  auditLog("update", "category"),
  updateCategory
);

router.delete(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  auditLog("delete", "category"),
  deleteCategory
);

router.put(
  "/:id/status",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  toggleCategoryStatus
);

router.post(
  "/sub",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  validateSubCategory,
  auditLog("create", "sub_category"),
  createSubCategory
);

router.put(
  "/sub/:id",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  validateSubCategoryUpdate,
  auditLog("update", "sub_category"),
  updateSubCategory
);

router.delete(
  "/sub/:id",
  authenticate,
  authorize("super_admin", "admin"),
  auditLog("delete", "sub_category"),
  deleteSubCategory
);

router.post(
  "/child",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  validateChildCategory,
  auditLog("create", "child_category"),
  createChildCategory
);

router.put(
  "/child/:id",
  authenticate,
  authorize("super_admin", "admin"),
  upload.single("image"),
  uploadErrorHandler,
  validateChildCategoryUpdate,
  auditLog("update", "child_category"),
  updateChildCategory
);

router.delete(
  "/child/:id",
  authenticate,
  authorize("super_admin", "admin"),
  auditLog("delete", "child_category"),
  deleteChildCategory
);

module.exports = router;

// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const { auditLog } = require("../middleware/auditMiddleware");
// const {
//   validateCategory,
//   validateSubCategory,
//   validateSubCategoryUpdate,
//   validateChildCategory,
//   validateChildCategoryUpdate,
// } = require("../validators/categoryValidator");
// const {
//   getCategories,
//   getAllCategories,
//   getCategory,
//   createCategory,
//   updateCategory,
//   deleteCategory,
//   toggleCategoryStatus,
//   getSubCategories,
//   createSubCategory,
//   updateSubCategory,
//   deleteSubCategory,
//   getChildCategories,
//   createChildCategory,
//   updateChildCategory,
//   deleteChildCategory,
//   getCategoryHierarchy,
// } = require("../controllers/categoryController");
// const router = express.Router();

// // Hierarchy
// router.get("/hierarchy", getCategoryHierarchy);
// router.get("/all", getAllCategories);

// // Main Categories
// router.get("/", getCategories);
// router.get("/:id", getCategory);
// router.post("/", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, validateCategory, auditLog("create", "category"), createCategory);
// router.put("/:id", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, auditLog("update", "category"), updateCategory);
// router.delete("/:id", authenticate, authorize("super_admin", "admin"), auditLog("delete", "category"), deleteCategory);
// router.put("/:id/status", authenticate, authorize("super_admin", "admin", "manager"), toggleCategoryStatus);

// // Sub Categories
// router.get("/:mainId/sub", getSubCategories);
// router.post("/sub", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, validateSubCategory, auditLog("create", "sub_category"), createSubCategory);
// router.put("/sub/:id", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, validateSubCategoryUpdate, auditLog("update", "sub_category"), updateSubCategory);
// router.delete("/sub/:id", authenticate, authorize("super_admin", "admin"), auditLog("delete", "sub_category"), deleteSubCategory);

// // Child Categories
// router.get("/sub/:subId/child", getChildCategories);
// router.post("/child", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, validateChildCategory, auditLog("create", "child_category"), createChildCategory);
// router.put("/child/:id", authenticate, authorize("super_admin", "admin"), upload.single("image"), uploadErrorHandler, validateChildCategoryUpdate, auditLog("update", "child_category"), updateChildCategory);
// router.delete("/child/:id", authenticate, authorize("super_admin", "admin"), auditLog("delete", "child_category"), deleteChildCategory);

// module.exports = router;