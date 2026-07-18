const { query } = require("../config/db");
const logger = require("../config/logger");
const { normalizeIndianPhone } = require("./otpHelper");

const DEFAULT_360MESSENGER_URL =
  "https://api.360messenger.com/v2/sendMessage";

const getWhatsAppConfig = async (storeId) => {
  const rows = await query(
    `SELECT
       whatsapp_enabled,
       whatsapp_provider,
       whatsapp_api_key,
       whatsapp_api_url
     FROM integration_settings
     WHERE store_id = ?
     LIMIT 1`,
    [storeId]
  );

  const row = rows[0];

  if (!row) {
    throw new Error(
      "WhatsApp integration is not configured"
    );
  }

  const enabled =
    row.whatsapp_enabled === 1 ||
    row.whatsapp_enabled === true ||
    row.whatsapp_enabled === "1";

  if (!enabled) {
    throw new Error("WhatsApp is not enabled");
  }

  const apiKey = String(
    row.whatsapp_api_key || ""
  ).trim();

  if (!apiKey) {
    throw new Error(
      "360Messenger API key is not configured"
    );
  }

  return {
    apiKey,
    apiUrl: String(
      row.whatsapp_api_url ||
        DEFAULT_360MESSENGER_URL
    ).trim(),
  };
};

const formatRecipient = (phone) => {
  const normalizedPhone =
    normalizeIndianPhone(phone);

  if (!normalizedPhone) {
    throw new Error(
      "Customer WhatsApp number is missing"
    );
  }

  return `91${normalizedPhone}`;
};

/**
 * Common WhatsApp message sender.
 * OTP and order confirmation rendu ee function use chesthayi.
 */
const sendWhatsAppMessage = async ({
  storeId,
  phone,
  message,
}) => {
  const config = await getWhatsAppConfig(storeId);
  const recipient = formatRecipient(phone);

  if (!message?.trim()) {
    throw new Error(
      "WhatsApp message cannot be empty"
    );
  }

  const formData = new FormData();

  formData.append("phonenumber", recipient);
  formData.append("text", message.trim());

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    const responseText = await response.text();

    let responseBody = {};

    try {
      responseBody = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      responseBody = {
        raw: responseText,
      };
    }

    if (!response.ok) {
      logger.error(
        "360Messenger API error:",
        {
          storeId,
          recipient,
          status: response.status,
          responseBody,
        }
      );

      throw new Error(
        responseBody?.message ||
          responseBody?.error ||
          responseBody?.raw ||
          "WhatsApp message failed"
      );
    }

    logger.info(
      `360Messenger message sent to ${recipient}`
    );

    return responseBody;
  } catch (error) {
    logger.error(
      "360Messenger connection failed:",
      {
        storeId,
        recipient,
        message: error.message,
      }
    );

    throw error;
  }
};

/**
 * Existing registration / forgot-password OTP.
 */
const sendWhatsAppOtp = async ({
  storeId,
  phone,
  otp,
}) => {
  const message =
    `Your LM Showroom verification OTP is ${otp}. ` +
    `This OTP is valid for 5 minutes.`;

  return sendWhatsAppMessage({
    storeId,
    phone,
    message,
  });
};

const formatAmount = (amount) =>
  Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const parseVariantInfo = (variantInfo) => {
  if (!variantInfo) return {};

  if (typeof variantInfo === "object") {
    return variantInfo;
  }

  try {
    return JSON.parse(variantInfo);
  } catch {
    return {};
  }
};

const buildItemLines = (items = []) => {
  return items
    .map((item, index) => {
      const variant =
        parseVariantInfo(item.variant_info);

      const size =
        variant.selected_size ||
        variant.size ||
        "";

      const color =
        variant.selected_color ||
        variant.color ||
        "";

      const variantParts = [];

      
      if (size) {
        variantParts.push(`Size: ${size}`);
      }

      if (color) {
        variantParts.push(`Color: ${color}`);
      }

      const variantText = variantParts.length
        ? ` (${variantParts.join(", ")})`
        : "";

      const quantity = Number(
        item.quantity || 1
      );

      const saleMode =
  variant.sale_mode ||
  item.sale_mode ||
  "piece";

const unitName =
  variant.unit_name ||
  item.unit_name ||
  (saleMode === "meter"
    ? "meter"
    : "piece");

const quantityLabel =
  saleMode === "meter"
    ? `Length: ${quantity} ${unitName}`
    : `Qty: ${quantity}`;

      const lineTotal = Number(
        item.total_price ||
          Number(
            item.offer_price ||
              item.price ||
              0
          ) * quantity
      );

      return (
        `${index + 1}. ${item.product_name}` +
        `${variantText}\n` +
        `${quantityLabel} | ₹${formatAmount(
          lineTotal
        )}`
      );
      // return (
      //   `${index + 1}. ${item.product_name}` +
      //   `${variantText}\n` +
      //   `Qty: ${quantity} | ₹${formatAmount(
      //     lineTotal
      //   )}`
      // );
    })
    .join("\n\n");
};

/**
 * Razorpay payment success ayina tarvatha
 * customer ki order confirmation pampisthundi.
 *
 * Tracking/shipment link include cheyyatam ledu.
 */
const sendOrderConfirmationWhatsApp = async ({
  storeId,
  order,
  items,
}) => {
  if (!order) {
    throw new Error(
      "Order details are required"
    );
  }

  const phone =
    order.shipping_phone ||
    order.phone;

  if (!phone) {
    throw new Error(
      "Customer phone number is missing"
    );
  }

  const customerName =
    order.shipping_name || "Customer";

  const itemDetails =
    buildItemLines(items || []);

  const message = [
    `Hello ${customerName},`,
    "",
    "Your order has been placed successfully at LM Showroom.",
    "",
    `Order Number: ${order.order_number}`,
    "",
    "Order Details:",
    itemDetails || "Your selected products",
    "",
    `Subtotal: ₹${formatAmount(
      order.subtotal
    )}`,
    Number(order.discount_amount || 0) > 0
      ? `Discount: -₹${formatAmount(
          order.discount_amount
        )}`
      : null,
    Number(order.gst_amount || 0) > 0
  ? `GST Included: ₹${formatAmount(
      order.gst_amount
    )}`
  : null,
    Number(order.shipping_charge || 0) > 0
      ? `Shipping: ₹${formatAmount(
          order.shipping_charge
        )}`
      : "Shipping: Free",
    `Total Paid: ₹${formatAmount(
      order.total_amount
    )}`,
    "Payment Status: Paid",
    "Payment Method: Online Payment",
    "",
    "Thank you for shopping with LM Showroom.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return sendWhatsAppMessage({
    storeId,
    phone,
    message,
  });
};

module.exports.getWhatsAppConfig =
  getWhatsAppConfig;

module.exports.sendWhatsAppMessage =
  sendWhatsAppMessage;

module.exports.sendWhatsAppOtp =
  sendWhatsAppOtp;

module.exports.sendOrderConfirmationWhatsApp =
  sendOrderConfirmationWhatsApp;
  
  
  
  
 
