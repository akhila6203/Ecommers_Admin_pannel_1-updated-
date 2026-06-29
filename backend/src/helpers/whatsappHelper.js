import { query } from "../config/db.js";
import logger from "../config/logger.js";
import { normalizeIndianPhone } from "./otpHelper.js";

const DIALOG360_API_URL = "https://waba-v2.360dialog.io/messages";
const DEFAULT_TEMPLATE_LANGUAGE = "en";

export const getWhatsAppConfig = async (storeId) => {
  const rows = await query(
    `SELECT whatsapp_enabled, whatsapp_provider, whatsapp_api_key,
            whatsapp_phone_number, whatsapp_template_name,
            whatsapp_phone_number_id, whatsapp_business_account_id
     FROM integration_settings
     WHERE store_id = ?
     LIMIT 1`,
    [storeId]
  );

  const row = rows[0];
  if (!row) {
    throw new Error("WhatsApp integration is not configured for this store");
  }

  const enabled =
    row.whatsapp_enabled === 1 ||
    row.whatsapp_enabled === true ||
    row.whatsapp_enabled === "1";

  if (!enabled) {
    throw new Error("WhatsApp OTP is not enabled for this store");
  }

  const provider = String(row.whatsapp_provider || "360dialog").toLowerCase();
  const apiKey = row.whatsapp_api_key?.trim();

  if (!apiKey) {
    throw new Error("WhatsApp API key / access token is not configured");
  }

  const templateName = row.whatsapp_template_name?.trim();
  if (!templateName) {
    throw new Error("WhatsApp OTP template name is not configured");
  }

  return {
    provider,
    apiKey,
    businessNumber: row.whatsapp_phone_number?.trim() || "",
    templateName,
    templateLanguage: DEFAULT_TEMPLATE_LANGUAGE,
    phoneNumberId: row.whatsapp_phone_number_id?.trim() || "",
    businessAccountId: row.whatsapp_business_account_id?.trim() || "",
  };
};

const formatWhatsAppRecipient = (phone) => {
  const normalized = normalizeIndianPhone(phone);
  return `91${normalized}`;
};

const parseResponseBody = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
};

const sendVia360Dialog = async (config, phone, otp, storeId) => {
  const recipient = formatWhatsAppRecipient(phone);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: String(otp) }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: String(otp) }],
        },
      ],
    },
  };

  const response = await fetch(DIALOG360_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "D360-API-KEY": config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    logger.error("360dialog WhatsApp OTP send failed:", {
      storeId,
      status: response.status,
      body,
    });

    throw new Error(
      body?.error?.message ||
        body?.meta?.developer_message ||
        "Failed to send WhatsApp OTP via 360dialog"
    );
  }

  logger.info(`360dialog WhatsApp OTP sent to ${recipient} for store ${storeId}`);
  return body;
};

const sendViaMetaCloud = async (config, phone, otp, storeId) => {
  if (!config.phoneNumberId) {
    throw new Error("Meta Phone Number ID is required");
  }

  const recipient = formatWhatsAppRecipient(phone);

  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: String(otp) }],
        },
      ],
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const body = await parseResponseBody(response);

  if (!response.ok) {
    logger.error("Meta WhatsApp OTP send failed:", {
      storeId,
      status: response.status,
      body,
    });

    throw new Error(body?.error?.message || "Failed to send WhatsApp OTP via Meta");
  }

  logger.info(`Meta WhatsApp OTP sent to ${recipient} for store ${storeId}`);
  return body;
};

// const sendViaMsg91 = async () => {
//   throw new Error(
//     "MSG91 WhatsApp provider is not configured yet. Add MSG91 template payload after getting MSG91 approved template details."
//   );
// };

export const sendWhatsAppOtp = async ({ storeId, phone, otp }) => {
  const config = await getWhatsAppConfig(storeId);

  if (config.provider === "360dialog") {
    return sendVia360Dialog(config, phone, otp, storeId);
  }

  if (config.provider === "meta") {
    return sendViaMetaCloud(config, phone, otp, storeId);
  }

  // if (config.provider === "msg91") {
  //   return sendViaMsg91(config, phone, otp, storeId);
  // }

  throw new Error(`Unsupported WhatsApp provider: ${config.provider}`);
};


// import { query } from "../config/db.js";
// import logger from "../config/logger.js";
// import { normalizeIndianPhone } from "./otpHelper.js";

// const DIALOG360_API_URL = "https://waba-v2.360dialog.io/messages";
// const DEFAULT_TEMPLATE_LANGUAGE = "en";

// export const getWhatsAppConfig = async (storeId) => {
//   const rows = await query(
//     `SELECT whatsapp_enabled, whatsapp_provider, whatsapp_api_key,
//             whatsapp_phone_number, whatsapp_template_name
//      FROM integration_settings
//      WHERE store_id = ?
//      LIMIT 1`,
//     [storeId]
//   );

//   const row = rows[0];
//   if (!row) {
//     throw new Error("WhatsApp integration is not configured for this store");
//   }

//   const enabled =
//     row.whatsapp_enabled === 1 ||
//     row.whatsapp_enabled === true ||
//     row.whatsapp_enabled === "1";

//   if (!enabled) {
//     throw new Error("WhatsApp OTP is not enabled for this store");
//   }

//   const provider = (row.whatsapp_provider || "360dialog").toLowerCase();
//   if (provider !== "360dialog") {
//     throw new Error(`Unsupported WhatsApp provider: ${provider}`);
//   }

//   const apiKey = row.whatsapp_api_key?.trim();
//   if (!apiKey) {
//     throw new Error("WhatsApp API key is not configured");
//   }

//   const templateName = row.whatsapp_template_name?.trim();
//   if (!templateName) {
//     throw new Error("WhatsApp OTP template name is not configured");
//   }

//   return {
//     provider,
//     apiKey,
//     phoneNumberId: row.whatsapp_phone_number?.trim() || "",
//     templateName,
//     templateLanguage: DEFAULT_TEMPLATE_LANGUAGE,
//   };
// };

// const formatWhatsAppRecipient = (phone) => {
//   const normalized = normalizeIndianPhone(phone);
//   return `91${normalized}`;
// };

// export const sendWhatsAppOtp = async ({ storeId, phone, otp }) => {
//   const config = await getWhatsAppConfig(storeId);
//   const recipient = formatWhatsAppRecipient(phone);

//   const payload = {
//     messaging_product: "whatsapp",
//     recipient_type: "individual",
//     to: recipient,
//     type: "template",
//     template: {
//       name: config.templateName,
//       language: { code: config.templateLanguage },
//       components: [
//         {
//           type: "body",
//           parameters: [{ type: "text", text: String(otp) }],
//         },
//         {
//           type: "button",
//           sub_type: "url",
//           index: 0,
//           parameters: [{ type: "text", text: String(otp) }],
//         },
//       ],
//     },
//   };

//   const response = await fetch(DIALOG360_API_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "D360-API-KEY": config.apiKey,
//     },
//     body: JSON.stringify(payload),
//   });

//   const responseBody = await response.text();
//   let parsedBody = null;
//   try {
//     parsedBody = responseBody ? JSON.parse(responseBody) : null;
//   } catch {
//     parsedBody = { raw: responseBody };
//   }

//   if (!response.ok) {
//     logger.error("360dialog WhatsApp OTP send failed:", {
//       storeId,
//       status: response.status,
//       body: parsedBody,
//     });
//     throw new Error(
//       parsedBody?.error?.message ||
//         parsedBody?.meta?.developer_message ||
//         "Failed to send WhatsApp OTP"
//     );
//   }

//   if (process.env.NODE_ENV !== "production") {
//     logger.info(`WhatsApp OTP sent to ${recipient} for store ${storeId}`);
//   }

//   return parsedBody;
// };
