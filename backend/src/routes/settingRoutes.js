const express = require("express");
const { authenticate , optionalAuth} = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

const {
  getSettings,
  getSettingsByGroup,
  updateSettings,
  updateSettingsByGroup,
  getPublicSettings,
  testEmailSettings,
  testShiprocketConnection,
} = require("../controllers/settingController");

const {
  getStoreInformation,
  updateStoreInformation,
  getIntegrationSettings,
  updateIntegrationSettings,
  getAboutUsSettings,
  updateAboutUsSettings,
  getPrivacyPolicy,
  updatePrivacyPolicy,
  getTermsConditions,
  updateTermsConditions,
  getContactPage,
  updateContactPage,
} = require("../controllers/settingsSectionController");

const router = express.Router();

router.get("/public", optionalAuth, getPublicSettings);

router.get("/store-information", optionalAuth, getStoreInformation);
router.put("/store-information", authenticate, authorize("super_admin", "admin"), updateStoreInformation);

router.get("/integrations", authenticate, authorize("super_admin", "admin"), getIntegrationSettings);
router.put("/integrations", authenticate, authorize("super_admin", "admin"), updateIntegrationSettings);

router.get("/about-us", optionalAuth, getAboutUsSettings);
// router.get("/about-us",optionalAuth, authorize("super_admin", "admin"), getAboutUsSettings);
router.put("/about-us", authenticate, authorize("super_admin", "admin"), updateAboutUsSettings);

router.get("/privacy-policy", optionalAuth, getPrivacyPolicy);
// router.get("/privacy-policy", authenticate, authorize("super_admin", "admin"), getPrivacyPolicy);
router.put("/privacy-policy", authenticate, authorize("super_admin", "admin"), updatePrivacyPolicy);

router.get("/terms-conditions", optionalAuth, getTermsConditions);
// router.get("/terms-conditions", optionalAuth, authorize("super_admin", "admin"), getTermsConditions);
router.put("/terms-conditions", authenticate, authorize("super_admin", "admin"), updateTermsConditions);

router.get("/contact-page", optionalAuth, getContactPage);
router.put("/contact-page", authenticate, authorize("super_admin", "admin"), updateContactPage);

router.post("/test-email", authenticate, authorize("super_admin", "admin"), testEmailSettings);
router.post("/test-shiprocket", authenticate, authorize("super_admin", "admin"), testShiprocketConnection);

router.get("/", authenticate, authorize("super_admin", "admin"), getSettings);
router.put("/", authenticate, authorize("super_admin", "admin"), updateSettings);

router.get("/:group", authenticate, authorize("super_admin", "admin"), getSettingsByGroup);
router.put("/:group", authenticate, authorize("super_admin", "admin"), updateSettingsByGroup);

module.exports = router;

// const express = require("express");
// const { authenticate } = require("../middleware/authMiddleware");
// const { authorize } = require("../middleware/roleMiddleware");
// const {
//   getSettings, getSettingsByGroup, updateSettings,
//   updateSettingsByGroup, getPublicSettings,
//   testEmailSettings, testShiprocketConnection,
// } = require("../controllers/settingController");
// const {
//   getStoreInformation,
//   updateStoreInformation,
//   getIntegrationSettings,
//   updateIntegrationSettings,
//   getAboutUsSettings,
//   updateAboutUsSettings,
//   getPrivacyPolicy,
//   updatePrivacyPolicy,
//   getTermsConditions,
//   updateTermsConditions,
//   getContactPage,
//   updateContactPage,
// } = require("../controllers/settingsSectionController");
// const router = express.Router();

// // Public - store info
// router.get("/public", getPublicSettings);

// // Section-specific routes (must be before /:group)
// // router.get("/store-information", authenticate, authorize("super_admin", "admin"), getStoreInformation);
// router.get("/store-information", getStoreInformation);
// router.put("/store-information", authenticate, authorize("super_admin", "admin"), updateStoreInformation);

// router.get("/integrations", authenticate, authorize("super_admin", "admin"), getIntegrationSettings);
// router.put("/integrations", authenticate, authorize("super_admin", "admin"), updateIntegrationSettings);

// router.get("/about-us", authenticate, authorize("super_admin", "admin"), getAboutUsSettings);
// router.put("/about-us", authenticate, authorize("super_admin", "admin"), updateAboutUsSettings);

// router.get("/privacy-policy", authenticate, authorize("super_admin", "admin"), getPrivacyPolicy);
// router.put("/privacy-policy", authenticate, authorize("super_admin", "admin"), updatePrivacyPolicy);

// router.get("/terms-conditions", authenticate, authorize("super_admin", "admin"), getTermsConditions);
// router.put("/terms-conditions", authenticate, authorize("super_admin", "admin"), updateTermsConditions);

// router.get("/contact-page", getContactPage);
// router.put("/contact-page", authenticate, authorize("super_admin", "admin"), updateContactPage);
// // router.get("/contact-page", authenticate, authorize("super_admin", "admin"), getContactPage);
// // router.put("/contact-page", authenticate, authorize("super_admin", "admin"), updateContactPage);

// // Protected generic routes
// router.post("/test-email", authenticate, authorize("super_admin", "admin"), testEmailSettings);
// router.post("/test-shiprocket", authenticate, authorize("super_admin", "admin"), testShiprocketConnection);
// router.get("/", authenticate, authorize("super_admin", "admin"), getSettings);
// router.put("/", authenticate, authorize("super_admin", "admin"), updateSettings);
// router.get("/:group", authenticate, authorize("super_admin", "admin"), getSettingsByGroup);
// router.put("/:group", authenticate, authorize("super_admin", "admin"), updateSettingsByGroup);

// module.exports = router;