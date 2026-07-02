const { query } = require("../config/db");
const logger = require("../config/logger");
const { normalizeIndianPhone } = require("./otpHelper");

const DEFAULT_360MESSENGER_URL = "https://api.360messenger.com/v2/sendMessage";

const getWhatsAppConfig = async (storeId) => {
  const rows = await query(
    `SELECT whatsapp_enabled, whatsapp_provider, whatsapp_api_key, whatsapp_api_url
     FROM integration_settings
     WHERE store_id = ?
     LIMIT 1`,
    [storeId]
  );

  const row = rows[0];
  if (!row) throw new Error("WhatsApp integration is not configured");

  const enabled = row.whatsapp_enabled === 1 || row.whatsapp_enabled === true || row.whatsapp_enabled === "1";
  if (!enabled) throw new Error("WhatsApp OTP is not enabled");

  const apiKey = String(row.whatsapp_api_key || "").trim();
  if (!apiKey) throw new Error("360Messenger API key is not configured");

  return {
    apiKey,
    apiUrl: String(row.whatsapp_api_url || DEFAULT_360MESSENGER_URL).trim(),
  };
};

const formatRecipient = (phone) => {
  const normalized = normalizeIndianPhone(phone);
  return `91${normalized}`;
};

const sendWhatsAppOtp = async ({ storeId, phone, otp }) => {
  const config = await getWhatsAppConfig(storeId);
  const recipient = formatRecipient(phone);

  const message = `Your LM Shopping Mall verification OTP is ${otp}. This OTP is valid for 5 minutes.`;

  const formData = new FormData();
  formData.append("phonenumber", recipient);
  formData.append("text", message);

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      logger.error("360Messenger API error:", {
        status: response.status,
        body,
      });

      throw new Error(body?.message || body?.error || body?.raw || "360Messenger OTP failed");
    }

    logger.info(`360Messenger OTP sent to ${recipient}`);
    return body;
  } catch (error) {
    logger.error("360Messenger fetch failed:", {
      message: error.message,
      apiUrl: config.apiUrl,
      recipient,
    });

    throw new Error(`360Messenger connection failed: ${error.message}`);
  }
};

module.exports.getWhatsAppConfig = getWhatsAppConfig;
module.exports.sendWhatsAppOtp = sendWhatsAppOtp;


