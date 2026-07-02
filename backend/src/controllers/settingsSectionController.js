const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const upsertSetting = async (groupName, key, value, type = "text", storeId = 1) => {
  const settingValue =
    type === "json" || typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  await query(
    `INSERT INTO settings (store_id, group_name, key_name, value, type)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)`,
    [storeId, groupName, key, settingValue, type]
  );
};

const getGroupFlat = async (groupName, defaults = {}, storeId = 1) => {
  const rows = await query(
    "SELECT key_name, value, type FROM settings WHERE group_name = ? AND store_id = ?",
    [groupName, storeId]
  );
  const result = { ...defaults };
  for (const row of rows) {
    let value = row.value;
    if (row.type === "json") {
      try {
        value = JSON.parse(row.value);
      } catch {
        value = row.value;
      }
    }
    result[row.key_name] = value ?? defaults[row.key_name] ?? "";
  }
  return result;
};

const saveGroupFlat = async (groupName, data, jsonKeys = [], storeId = 1) => {
  for (const [key, value] of Object.entries(data)) {
    const type = jsonKeys.includes(key) ? "json" : "text";
    await upsertSetting(groupName, key, value, type, storeId);
  }
};

const STORE_DEFAULTS = {
  companyName: "",
  contactEmail: "",
  websiteUrl: "",
  gstin: "",
  pan: "",
  cin: "",
  gstStateCode: "",
  gstRegistrationType: "Regular",
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  whatsappNumber: "",
  whatsappMessage: "",
  storeAddress: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  storeLogo: "",
  storeBanner: "",
};

const STORE_DB_COLUMNS = {
  companyName: "company_name",
  contactEmail: "contact_email",
  websiteUrl: "website_url",
  gstin: "gstin",
  pan: "pan",
  cin: "cin",
  gstStateCode: "gst_state_code",
  gstRegistrationType: "gst_registration_type",
  facebookUrl: "facebook_url",
  instagramUrl: "instagram_url",
  linkedinUrl: "linkedin_url",
  youtubeUrl: "youtube_url",
  whatsappNumber: "whatsapp_number",
  whatsappMessage: "whatsapp_message",
  storeAddress: "store_address",
  city: "city",
  state: "state",
  country: "country",
  postalCode: "postal_code",
  storeLogo: "store_logo",
  storeBanner: "store_banner",
};

const mapStoreRowToApi = (row = {}) => ({
  companyName: row.company_name || "",
  contactEmail: row.contact_email || "",
  websiteUrl: row.website_url || "",
  gstin: row.gstin || "",
  pan: row.pan || "",
  cin: row.cin || "",
  gstStateCode: row.gst_state_code || "",
  gstRegistrationType: row.gst_registration_type || "Regular",
  facebookUrl: row.facebook_url || "",
  instagramUrl: row.instagram_url || "",
  linkedinUrl: row.linkedin_url || "",
  youtubeUrl: row.youtube_url || "",
  whatsappNumber: row.whatsapp_number || "",
  whatsappMessage: row.whatsapp_message || "",
  storeAddress: row.store_address || "",
  city: row.city || "",
  state: row.state || "",
  country: row.country || "",
  postalCode: row.postal_code || "",
  storeLogo: row.store_logo || "",
  storeBanner: row.store_banner || "",
});

const ensureStoreSettingsRow = async (storeId = 1) => {
  const rows = await query("SELECT id FROM store_settings WHERE store_id = ?", [storeId]);
  if (!rows.length) {
    await query("INSERT INTO store_settings (store_id) VALUES (?)", [storeId]);
  }
};

const getStoreSettingsRow = async (storeId = 1) => {
  await ensureStoreSettingsRow(storeId);
  const rows = await query("SELECT * FROM store_settings WHERE store_id = ? LIMIT 1", [storeId]);
  return rows[0] || {};
};

const saveStoreSettingsRow = async (data, storeId = 1) => {
  await ensureStoreSettingsRow(storeId);
  const merged = { ...STORE_DEFAULTS, ...data };
  const columns = Object.entries(STORE_DB_COLUMNS);
  const sets = columns.map(([, dbCol]) => `${dbCol} = ?`);
  const values = columns.map(([apiKey]) => merged[apiKey] ?? "");
  await query(`UPDATE store_settings SET ${sets.join(", ")} WHERE store_id = ?`, [...values, storeId]);
  return merged;
};

const PRIVACY_DEFAULTS = { title: "", content: "" };
const TERMS_DEFAULTS = { title: "", content: "" };
const CONTACT_DEFAULTS = {
  pageTitle: "",
  contactHeading: "",
  contactDescription: "",
  phoneNumber: "",
  emailAddress: "",
  address: "",
  googleMapsEmbedUrl: "",
  supportHours: "",
};

const defaultAboutSections = () => [
  {
    layout: "1-column",
    backgroundImage: "",
    columns: [
      {
        type: "text-btn",
        heading: "",
        content: "",
        buttonLabel: "",
        buttonLink: "",
      },
    ],
  },
];

const parseSections = (raw) => {
  if (!raw) return defaultAboutSections();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length ? parsed : defaultAboutSections();
  } catch {
    return defaultAboutSections();
  }
};

const isStoreDataEmpty = (data) =>
  !data.companyName &&
  !data.contactEmail &&
  !data.websiteUrl &&
  !data.storeLogo &&
  !data.storeAddress;

const migrateLegacyStore = async (result, storeId = 1) => {
  if (isStoreDataEmpty(result)) {
    const legacyInfo = await getGroupFlat("store_information", {}, storeId);
    if (!isStoreDataEmpty(legacyInfo)) {
      const migrated = { ...STORE_DEFAULTS, ...legacyInfo };
      try {
        await saveStoreSettingsRow(migrated, storeId);
      } catch (err) {
        logger.warn("Could not migrate store_information into store_settings:", err.message);
      }
      return migrated;
    }
  }

  const legacy = await getGroupFlat("store", {}, storeId);
  if (!result.companyName && legacy.storeName) result.companyName = legacy.storeName;
  if (!result.contactEmail && legacy.email) result.contactEmail = legacy.email;
  if (!result.storeAddress && legacy.address) result.storeAddress = legacy.address;
  if (!result.storeLogo && legacy.logoUrl) result.storeLogo = legacy.logoUrl;
  if (!result.whatsappNumber && legacy.whatsapp) result.whatsappNumber = legacy.whatsapp;
  return result;
};

const getStoreInformation = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const row = await getStoreSettingsRow(storeId);
    let data = mapStoreRowToApi(row);
    data = await migrateLegacyStore(data, storeId);
    return successResponse(res, data);
  } catch (error) {
    logger.error("Get store information error:", error);
    return errorResponse(res, "Failed to fetch store information", 500);
  }
};

const updateStoreInformation = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const data = { ...STORE_DEFAULTS, ...req.body };
    const saved = await saveStoreSettingsRow(data, storeId);

    if (saved.storeLogo) await upsertSetting("store", "logoUrl", saved.storeLogo, "text", storeId);
    if (saved.companyName) await upsertSetting("store", "storeName", saved.companyName, "text", storeId);

    return successResponse(res, saved, "Store information saved successfully");
  } catch (error) {
    logger.error("Update store information error:", error);
    return errorResponse(res, "Failed to update store information", 500);
  }
};

const INTEGRATION_DEFAULTS = {
  razorpay_enabled: false,
  razorpay_key_id: "",
  razorpay_key_secret: "",
  whatsapp_enabled: false,
whatsapp_provider: "360messenger",
whatsapp_api_url: "https://api.360messenger.com/v2/sendMessage",
whatsapp_api_key: "",
// whatsapp_sender: "",
// whatsapp_template_name: "",
//   whatsapp_enabled: false,
//   whatsapp_provider: "360dialog",
//   whatsapp_api_key: "",
  whatsapp_phone_number: "",
//   whatsapp_template_name: "",
//   whatsapp_phone_number_id: "",
// whatsapp_business_account_id: "",
  shiprocket_enabled: false,
  shiprocket_email: "",
  shiprocket_password: "",
  shiprocket_channel_id: "",
  shiprocket_pickup_location: "",
  refund_enabled: false,
  refund_auto: false,
  refund_days: 7,
  smtp_host: "",
  smtp_port: "",
  smtp_username: "",
  smtp_password: "",
  sender_email: "",
};

const INTEGRATION_DB_COLUMNS = {
  razorpay_enabled: "razorpay_enabled",
  razorpay_key_id: "razorpay_key_id",
  razorpay_key_secret: "razorpay_key_secret",
  whatsapp_enabled: "whatsapp_enabled",
whatsapp_provider: "whatsapp_provider",
whatsapp_api_url: "whatsapp_api_url",
whatsapp_api_key: "whatsapp_api_key",
// whatsapp_sender: "whatsapp_sender",
// whatsapp_template_name: "whatsapp_template_name",
//   whatsapp_enabled: "whatsapp_enabled",
//   whatsapp_provider: "whatsapp_provider",
//   whatsapp_api_key: "whatsapp_api_key",
  whatsapp_phone_number: "whatsapp_phone_number",
//   whatsapp_template_name: "whatsapp_template_name",
//   whatsapp_phone_number_id: "whatsapp_phone_number_id",
// whatsapp_business_account_id: "whatsapp_business_account_id",
  shiprocket_enabled: "shiprocket_enabled",
  shiprocket_email: "shiprocket_email",
  shiprocket_password: "shiprocket_password",
  shiprocket_channel_id: "shiprocket_channel_id",
  shiprocket_pickup_location: "shiprocket_pickup_location",
  refund_enabled: "refund_enabled",
  refund_auto: "refund_auto",
  refund_days: "refund_days",
  smtp_host: "smtp_host",
  smtp_port: "smtp_port",
  smtp_username: "smtp_username",
  smtp_password: "smtp_password",
  sender_email: "sender_email",
};

const BOOL_INTEGRATION_KEYS = new Set([
  "razorpay_enabled",
  "whatsapp_enabled",
  "shiprocket_enabled",
  "refund_enabled",
  "refund_auto",
]);

const mapIntegrationRowToApi = (row = {}) => {
  const result = { ...INTEGRATION_DEFAULTS };
  for (const [apiKey, dbCol] of Object.entries(INTEGRATION_DB_COLUMNS)) {
    if (row[dbCol] === undefined || row[dbCol] === null) continue;
    if (BOOL_INTEGRATION_KEYS.has(apiKey)) {
      result[apiKey] = row[dbCol] === 1 || row[dbCol] === true || row[dbCol] === "1";
    } else if (apiKey === "refund_days") {
      result[apiKey] = Number(row[dbCol]) || 7;
    } else {
      result[apiKey] = String(row[dbCol] ?? "");
    }
  }
  return result;
};

const ensureIntegrationSettingsRow = async (storeId = 1) => {
  const rows = await query("SELECT id FROM integration_settings WHERE store_id = ?", [storeId]);
  if (!rows.length) {
    await query("INSERT INTO integration_settings (store_id) VALUES (?)", [storeId]);
  }
};

const getIntegrationSettingsRow = async (storeId = 1) => {
  await ensureIntegrationSettingsRow(storeId);
  const rows = await query("SELECT * FROM integration_settings WHERE store_id = ? LIMIT 1", [storeId]);
  return rows[0] || {};
};

const saveIntegrationSettingsRow = async (data, storeId = 1) => {
  await ensureIntegrationSettingsRow(storeId);
  const merged = { ...INTEGRATION_DEFAULTS, ...data };
  const columns = Object.entries(INTEGRATION_DB_COLUMNS);
  const sets = columns.map(([, dbCol]) => `${dbCol} = ?`);
  const values = columns.map(([apiKey]) => {
    if (BOOL_INTEGRATION_KEYS.has(apiKey)) {
      return merged[apiKey] === true || merged[apiKey] === "true" || merged[apiKey] === 1 || merged[apiKey] === "1" ? 1 : 0;
    }
    if (apiKey === "refund_days") {
      return Number.parseInt(String(merged[apiKey] ?? 7), 10) || 7;
    }
    return String(merged[apiKey] ?? "");
  });
  await query(`UPDATE integration_settings SET ${sets.join(", ")} WHERE store_id = ?`, [...values, storeId]);
  return mapIntegrationRowToApi(
    Object.fromEntries(columns.map(([apiKey, dbCol], i) => [dbCol, values[i]]))
  );
};

const isIntegrationDataEmpty = (data) =>
  !data.razorpay_key_id &&
  !data.smtp_host &&
  !data.shiprocket_email &&
  !data.whatsapp_api_key;

const migrateLegacyIntegrations = async (result, storeId = 1) => {
  if (!isIntegrationDataEmpty(result)) return result;

  const legacy = await getGroupFlat("integrations", {}, storeId);
  if (isIntegrationDataEmpty(legacy)) return result;

  const migrated = { ...INTEGRATION_DEFAULTS };
  for (const key of Object.keys(INTEGRATION_DEFAULTS)) {
    const raw = legacy[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (BOOL_INTEGRATION_KEYS.has(key)) {
      migrated[key] = raw === true || raw === "true" || raw === 1 || raw === "1";
    } else if (key === "refund_days") {
      migrated[key] = Number.parseInt(String(raw), 10) || 7;
    } else {
      migrated[key] = String(raw);
    }
  }

  try {
    return await saveIntegrationSettingsRow(migrated, storeId);
  } catch (err) {
    logger.warn("Could not migrate integrations into integration_settings:", err.message);
    return migrated;
  }
};

const getIntegrationSettings = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const row = await getIntegrationSettingsRow(storeId);
    let data = mapIntegrationRowToApi(row);
    data = await migrateLegacyIntegrations(data, storeId);
    return successResponse(res, data);
  } catch (error) {
    logger.error("Get integration settings error:", error);
    return errorResponse(res, "Failed to fetch integration settings", 500);
  }
};

const updateIntegrationSettings = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const saved = await saveIntegrationSettingsRow({ ...INTEGRATION_DEFAULTS, ...req.body }, storeId);
    return successResponse(res, saved, "Integration settings saved successfully");
  } catch (error) {
    logger.error("Update integration settings error:", error);
    return errorResponse(res, "Failed to update integration settings", 500);
  }
};

const getAboutUsSettings = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const rows = await query(
      "SELECT key_name, value FROM settings WHERE group_name = ? AND store_id = ?",
      ["about_us", storeId]
    );
    const sectionsRow = rows.find((r) => r.key_name === "sections");
    const sections = sectionsRow?.value
      ? parseSections(sectionsRow.value)
      : defaultAboutSections();
    return successResponse(res, { sections });
  } catch (error) {
    logger.error("Get about us settings error:", error);
    return errorResponse(res, "Failed to fetch about us settings", 500);
  }
};

const updateAboutUsSettings = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { sections } = req.body || {};
    if (!Array.isArray(sections)) {
      return errorResponse(res, "sections must be an array", 400);
    }
    const normalized = sections.map((row) => ({
      layout: row.layout || "1-column",
      backgroundImage: row.backgroundImage || "",
      columns: (row.columns || []).map((col) =>
        col.type === "image"
          ? { type: "image", image: col.image || "" }
          : {
              type: "text-btn",
              heading: col.heading || "",
              content: col.content || "",
              buttonLabel: col.buttonLabel || "",
              buttonLink: col.buttonLink || "",
            }
      ),
    }));
    await upsertSetting("about_us", "sections", normalized, "json", storeId);
    return successResponse(res, { sections: normalized }, "About us saved successfully");
  } catch (error) {
    logger.error("Update about us settings error:", error);
    return errorResponse(res, "Failed to update about us settings", 500);
  }
};

const getPrivacyPolicy = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    let data = await getGroupFlat("privacy_policy", PRIVACY_DEFAULTS, storeId);
    if (!data.content) {
      const legacy = await getGroupFlat("privacy", {}, storeId);
      if (legacy.privacyPolicy) data = { title: "Privacy Policy", content: legacy.privacyPolicy };
    }
    return successResponse(res, data);
  } catch (error) {
    logger.error("Get privacy policy error:", error);
    return errorResponse(res, "Failed to fetch privacy policy", 500);
  }
};

const updatePrivacyPolicy = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const data = { ...PRIVACY_DEFAULTS, ...req.body };
    await saveGroupFlat("privacy_policy", data, [], storeId);
    return successResponse(res, data, "Privacy policy saved successfully");
  } catch (error) {
    logger.error("Update privacy policy error:", error);
    return errorResponse(res, "Failed to update privacy policy", 500);
  }
};

const getTermsConditions = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    let data = await getGroupFlat("terms_conditions", TERMS_DEFAULTS, storeId);
    if (!data.content) {
      const legacy = await getGroupFlat("terms", {}, storeId);
      if (legacy.termsContent) data = { title: "Terms & Conditions", content: legacy.termsContent };
    }
    return successResponse(res, data);
  } catch (error) {
    logger.error("Get terms conditions error:", error);
    return errorResponse(res, "Failed to fetch terms & conditions", 500);
  }
};

const updateTermsConditions = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const data = { ...TERMS_DEFAULTS, ...req.body };
    await saveGroupFlat("terms_conditions", data, [], storeId);
    return successResponse(res, data, "Terms & conditions saved successfully");
  } catch (error) {
    logger.error("Update terms conditions error:", error);
    return errorResponse(res, "Failed to update terms & conditions", 500);
  }
};

const getContactPage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    let data = await getGroupFlat("contact_page", CONTACT_DEFAULTS, storeId);
    if (!data.contactDescription) {
      const legacyStore = await getGroupFlat("store", {}, storeId);
      const legacyContact = await getGroupFlat("contact", {}, storeId);
      if (legacyContact.contactPage) data.contactDescription = legacyContact.contactPage;
      if (legacyStore.supportEmail) data.emailAddress = legacyStore.supportEmail;
      if (legacyStore.whatsapp) data.phoneNumber = legacyStore.whatsapp;
      if (legacyStore.location) data.address = legacyStore.location;
      if (legacyStore.mapLocation) data.googleMapsEmbedUrl = legacyStore.mapLocation;
    }
    return successResponse(res, data);
  } catch (error) {
    logger.error("Get contact page error:", error);
    return errorResponse(res, "Failed to fetch contact page", 500);
  }
};

const updateContactPage = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const data = { ...CONTACT_DEFAULTS, ...req.body };
    await saveGroupFlat("contact_page", data, [], storeId);
    return successResponse(res, data, "Contact page saved successfully");
  } catch (error) {
    logger.error("Update contact page error:", error);
    return errorResponse(res, "Failed to update contact page", 500);
  }
};

module.exports.getStoreInformation = getStoreInformation;
module.exports.updateStoreInformation = updateStoreInformation;
module.exports.getIntegrationSettings = getIntegrationSettings;
module.exports.updateIntegrationSettings = updateIntegrationSettings;
module.exports.getAboutUsSettings = getAboutUsSettings;
module.exports.updateAboutUsSettings = updateAboutUsSettings;
module.exports.getPrivacyPolicy = getPrivacyPolicy;
module.exports.updatePrivacyPolicy = updatePrivacyPolicy;
module.exports.getTermsConditions = getTermsConditions;
module.exports.updateTermsConditions = updateTermsConditions;
module.exports.getContactPage = getContactPage;
module.exports.updateContactPage = updateContactPage;
