const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const { upload, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const {
  getAdmins, getAdmin, createAdmin, updateAdmin, deleteAdmin,
  getRoles, createRole, updateRole, deleteRole, getPermissions,
} = require("../controllers/adminController");
const router = express.Router();

router.get("/roles", authenticate, authorize("super_admin"), getRoles);
router.post("/roles", authenticate, authorize("super_admin"), createRole);
router.put("/roles/:id", authenticate, authorize("super_admin"), updateRole);
router.delete("/roles/:id", authenticate, authorize("super_admin"), deleteRole);
router.get("/permissions", authenticate, authorize("super_admin"), getPermissions);

router.get("/", authenticate, authorize("super_admin", "admin"), getAdmins);
router.get("/:id", authenticate, authorize("super_admin", "admin"), getAdmin);
router.post("/", authenticate, authorize("super_admin"), upload.single("avatar"), uploadErrorHandler, createAdmin);
router.put("/:id", authenticate, authorize("super_admin"), upload.single("avatar"), uploadErrorHandler, updateAdmin);
router.delete("/:id", authenticate, authorize("super_admin"), deleteAdmin);

module.exports = router;