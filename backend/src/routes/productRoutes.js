const express = require("express");
const { authenticate, optionalAuth } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { productUpload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const { auditLog } = require("../middleware/auditMiddleware");
const { validateProduct, validateVariantOption, validateProductSeo } = require("../validators/productValidator");

const {
  getProducts,
  getProduct,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  bulkUploadProducts,
  toggleFeatured,
  toggleTrending,
  toggleBestSeller,
  updateProductStatus,
  updateStock,
  deleteProductImage,
  exportProductsExcel,
  getVariantOptions,
  createVariantOption,
  updateVariantOption,
  deleteVariantOption,
  generateVariantCombinations,
  updateVariant,
  deleteVariant,
  getProductSeo,
  updateProductSeo,
} = require("../controllers/productController");

const router = express.Router();

const productFileFields = [
  { name: "thumbnail", maxCount: 1 },
  { name: "gallery_images", maxCount: 20 },
  { name: "variant_images", maxCount: 50 },
  { name: "images", maxCount: 20 },
];


// Admin only
router.get("/export/excel", authenticate, exportProductsExcel);


// Public + Admin GET
router.get("/slug/:slug", optionalAuth, getProductBySlug);
router.get("/:productId/variant-options", optionalAuth, getVariantOptions);
router.get("/:productId/seo", optionalAuth, getProductSeo);
router.get("/", optionalAuth, getProducts);
router.get("/:id", optionalAuth, getProduct);


// router.get("/export/excel", authenticate, exportProductsExcel);
// router.get("/slug/:slug", authenticate, getProductBySlug);

// router.get("/:productId/variant-options", authenticate, getVariantOptions);
// router.get("/:productId/seo", authenticate, getProductSeo);

// router.get("/", authenticate, getProducts);
// router.get("/:id", authenticate, getProduct);

router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  productUpload.fields(productFileFields),
  uploadErrorHandler,
  validateProduct,
  auditLog("create", "product"),
  createProduct
);

router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  productUpload.fields(productFileFields),
  uploadErrorHandler,
  validateProduct,
  auditLog("update", "product"),
  updateProduct
);

router.delete(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  auditLog("delete", "product"),
  deleteProduct
);

router.post("/bulk-delete", authenticate, authorize("super_admin", "admin"), bulkDeleteProducts);
router.post("/bulk-upload", authenticate, authorize("super_admin", "admin"), bulkUploadProducts);

router.put("/:id/featured", authenticate, authorize("super_admin", "admin", "manager"), toggleFeatured);
router.put("/:id/trending", authenticate, authorize("super_admin", "admin", "manager"), toggleTrending);
router.put("/:id/best-seller", authenticate, authorize("super_admin", "admin", "manager"), toggleBestSeller);

router.put("/:id/status", authenticate, authorize("super_admin", "admin", "manager"), updateProductStatus);
router.put("/:id/stock", authenticate, authorize("super_admin", "admin", "manager"), updateStock);

router.delete("/:id/images/:imageId", authenticate, authorize("super_admin", "admin"), deleteProductImage);

router.post("/:productId/variant-options", authenticate, authorize("super_admin", "admin", "manager"), validateVariantOption, createVariantOption);
router.put("/:productId/variant-options/:optionId", authenticate, authorize("super_admin", "admin", "manager"), validateVariantOption, updateVariantOption);
router.delete("/:productId/variant-options/:optionId", authenticate, authorize("super_admin", "admin"), deleteVariantOption);

router.post("/:productId/variant-combinations/generate", authenticate, authorize("super_admin", "admin", "manager"), generateVariantCombinations);

router.put("/:productId/variants/:variantId", authenticate, authorize("super_admin", "admin", "manager"), updateVariant);
router.delete("/:productId/variants/:variantId", authenticate, authorize("super_admin", "admin"), deleteVariant);

router.put(
  "/:productId/seo",
  authenticate,
  authorize("super_admin", "admin", "manager"),
  validateProductSeo,
  auditLog("update", "product_seo"),
  updateProductSeo
);

module.exports = router;


// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const { upload, productUpload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
// const { auditLog } = require("../middleware/auditMiddleware");
// const { validateProduct, validateVariantOption, validateProductSeo } = require("../validators/productValidator");
// const {
//   getProducts,
//   getProduct,
//   getProductBySlug,
//   createProduct,
//   updateProduct,
//   deleteProduct,
//   bulkDeleteProducts,
//   bulkUploadProducts,
//   toggleFeatured,
//   toggleTrending,
//   toggleBestSeller,
//   updateProductStatus,
//   updateStock,
//   deleteProductImage,
//   exportProductsExcel,
//   getVariantOptions,
//   createVariantOption,
//   updateVariantOption,
//   deleteVariantOption,
//   generateVariantCombinations,
//   updateVariant,
//   deleteVariant,
//   getProductSeo,
//   updateProductSeo,
// } = require("../controllers/productController");
// const router = express.Router();

// const productFileFields = [
//   { name: "thumbnail", maxCount: 1 },
//   { name: "gallery_images", maxCount: 20 },
//   { name: "variant_images", maxCount: 50 },
//   { name: "images", maxCount: 20 },
// ];

// // Public routes
// router.get("/export/excel", exportProductsExcel);
// router.get("/slug/:slug", getProductBySlug);

// // CRUD
// router.get("/", getProducts);
// router.get("/:id", getProduct);
// router.post("/", authenticate, authorize("super_admin", "admin", "manager"), productUpload.fields(productFileFields), uploadErrorHandler, validateProduct, auditLog("create", "product"), createProduct);
// router.put("/:id", authenticate, authorize("super_admin", "admin", "manager"), productUpload.fields(productFileFields), uploadErrorHandler, validateProduct, auditLog("update", "product"), updateProduct);
// router.delete("/:id", authenticate, authorize("super_admin", "admin"), auditLog("delete", "product"), deleteProduct);

// // Bulk operations
// router.post("/bulk-delete", authenticate, authorize("super_admin", "admin"), bulkDeleteProducts);
// router.post("/bulk-upload", authenticate, authorize("super_admin", "admin"), bulkUploadProducts);

// // Toggle routes
// router.put("/:id/featured", authenticate, authorize("super_admin", "admin", "manager"), toggleFeatured);
// router.put("/:id/trending", authenticate, authorize("super_admin", "admin", "manager"), toggleTrending);
// router.put("/:id/best-seller", authenticate, authorize("super_admin", "admin", "manager"), toggleBestSeller);

// // Status & Stock
// router.put("/:id/status", authenticate, authorize("super_admin", "admin", "manager"), updateProductStatus);
// router.put("/:id/stock", authenticate, authorize("super_admin", "admin", "manager"), updateStock);

// // Images
// router.delete("/:id/images/:imageId", authenticate, authorize("super_admin", "admin"), deleteProductImage);

// // ============================================================
// // VARIANT OPTIONS ROUTES
// // ============================================================
// router.get("/:productId/variant-options", getVariantOptions);
// router.post("/:productId/variant-options", authenticate, authorize("super_admin", "admin", "manager"), validateVariantOption, createVariantOption);
// router.put("/:productId/variant-options/:optionId", authenticate, authorize("super_admin", "admin", "manager"), validateVariantOption, updateVariantOption);
// router.delete("/:productId/variant-options/:optionId", authenticate, authorize("super_admin", "admin"), deleteVariantOption);

// // Variant combinations (auto-generate)
// router.post("/:productId/variant-combinations/generate", authenticate, authorize("super_admin", "admin", "manager"), generateVariantCombinations);

// // Individual variant update / delete
// router.put("/:productId/variants/:variantId", authenticate, authorize("super_admin", "admin", "manager"), updateVariant);
// router.delete("/:productId/variants/:variantId", authenticate, authorize("super_admin", "admin"), deleteVariant);

// // ============================================================
// // SEO ROUTES
// // ============================================================
// router.get("/:productId/seo", getProductSeo);
// router.put("/:productId/seo", authenticate, authorize("super_admin", "admin", "manager"), validateProductSeo, auditLog("update", "product_seo"), updateProductSeo);

// module.exports = router;