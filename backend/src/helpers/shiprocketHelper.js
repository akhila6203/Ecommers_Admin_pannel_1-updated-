const { query } = require("../config/db");
const logger = require("../config/logger");
const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

/** @type {Map<number, { token: string, expiresAt: number }>} */
const tokenCache = new Map();

const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

const mapShiprocketStatus = (rawStatus = "") => {
  const status = String(rawStatus).toLowerCase().trim();
  if (!status) return null;

  if (status.includes("deliver") && !status.includes("out for")) {
    return "delivered";
  }
  if (status.includes("out for delivery") || status.includes("out-for-delivery")) {
    return "out_for_delivery";
  }
  if (
    status.includes("shipped") ||
    status.includes("in transit") ||
    status.includes("in-transit") ||
    status.includes("picked") ||
    status.includes("pickup") ||
    status.includes("manifest")
  ) {
    return "shipped";
  }
  if (status.includes("cancel")) {
    return "cancelled";
  }
  if (status.includes("rto") || status.includes("return")) {
    return "returned";
  }

  return null;
};

const getShiprocketConfig = async (storeId) => {
  const rows = await query(
    `SELECT shiprocket_enabled, shiprocket_email, shiprocket_password, shiprocket_channel_id,  shiprocket_pickup_location
     FROM integration_settings
     WHERE store_id = ?
     LIMIT 1`,
    [storeId]
  );

  if (!rows.length || Number(rows[0].shiprocket_enabled) !== 1) {
    throw new Error("Shiprocket integration is disabled for this store");
  }

  if (!rows[0].shiprocket_email || !rows[0].shiprocket_password) {
    throw new Error("Shiprocket credentials are not configured for this store");
  }

  return {
    email: rows[0].shiprocket_email,
    password: rows[0].shiprocket_password,
    channelId: rows[0].shiprocket_channel_id || null,
    pickupLocation: rows[0].shiprocket_pickup_location || "",
  };
};

const loginShiprocket = async (storeId) => {
  const cached = tokenCache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const config = await getShiprocketConfig(storeId);
  const response = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    logger.error("Shiprocket login failed:", { storeId, status: response.status, data });
    throw new Error(data.message || data.error || "Failed to authenticate with Shiprocket");
  }

  tokenCache.set(storeId, {
    token: data.token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return data.token;
};

const shiprocketApi = async (storeId, method, endpoint, data = null) => {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${SHIPROCKET_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const executeRequest = async (token) => {
    const options = {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (data && !["GET", "HEAD"].includes(options.method)) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    return { response, payload };
  };

  let token = await loginShiprocket(storeId);
  let { response, payload } = await executeRequest(token);

  if (response.status === 401) {
    tokenCache.delete(storeId);
    token = await loginShiprocket(storeId);
    ({ response, payload } = await executeRequest(token));
  }

  if (!response.ok) {
    logger.error("Shiprocket API error:", {
      storeId,
      method,
      endpoint,
      status: response.status,
      payload,
    });
    throw new Error(payload.message || payload.error || `Shiprocket API request failed (${response.status})`);
  }

  return payload;
};

const buildAdhocOrderPayload = (order, orderItems, config, overrides = {}) => {
  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().slice(0, 19).replace("T", " ")
    : new Date().toISOString().slice(0, 19).replace("T", " ");

  const payload = {
    order_id: String(order.order_number).slice(0, 50),
    order_date: orderDate,
    pickup_location: overrides.pickup_location || config.pickupLocation,
    shipping_is_billing: true,
    billing_customer_name: order.shipping_name || order.billing_name || "Customer",
    billing_last_name: "",
    billing_address: order.shipping_address || order.billing_address || "",
    billing_address_2: "",
    billing_city: order.shipping_city || order.billing_city || "",
    billing_state: order.shipping_state || order.billing_state || "",
    billing_pincode: order.shipping_pincode || order.billing_pincode || "",
    billing_country: order.shipping_country || order.billing_country || "India",
    billing_email: order.email || "",
    billing_phone: order.shipping_phone || order.phone || order.billing_phone || "",
    shipping_customer_name: order.shipping_name || order.billing_name || "Customer",
    shipping_address: order.shipping_address || order.billing_address || "",
    shipping_address_2: "",
    shipping_city: order.shipping_city || order.billing_city || "",
    shipping_state: order.shipping_state || order.billing_state || "",
    shipping_pincode: order.shipping_pincode || order.billing_pincode || "",
    shipping_country: order.shipping_country || order.billing_country || "India",
    shipping_email: order.email || "",
    shipping_phone: order.shipping_phone || order.phone || order.billing_phone || "",
    payment_method: Number(order.is_paid) === 1 || order.payment_status === "paid" ? "Prepaid" : "COD",
    sub_total: Number(order.subtotal || order.total_amount || 0),
    length: overrides.length || 10,
    breadth: overrides.breadth || 10,
    height: overrides.height || 10,
    weight: overrides.weight || 0.5,
    order_items: orderItems.map((item) => ({
      name: item.product_name || "Product",
      sku: item.product_sku || `SKU-${item.product_id || item.id}`,
      units: Number(item.quantity) || 1,
      selling_price: Number(item.offer_price || item.price || 0),
      discount: 0,
      tax: Number(item.gst_amount || 0),
    })),
  };

  if (config.channelId) {
    const channelId = parseInt(config.channelId, 10);
    if (!Number.isNaN(channelId) && channelId > 0) {
      payload.channel_id = channelId;
    }
  }

  return payload;
};

const createAdhocOrder = async (storeId, order, orderItems, overrides = {}) => {
  const config = await getShiprocketConfig(storeId);
  const payload = buildAdhocOrderPayload(order, orderItems, config, overrides);
  return shiprocketApi(storeId, "POST", "/orders/create/adhoc", payload);
};

const assignAwb = async (storeId, shipmentId, courierId = null) => {
  const payload = { shipment_id: parseInt(shipmentId, 10) };
  if (courierId) {
    payload.courier_id = parseInt(courierId, 10);
  }
  return shiprocketApi(storeId, "POST", "/courier/assign/awb", payload);
};

const trackByAwb = async (storeId, awbCode) => {
  const encoded = encodeURIComponent(String(awbCode).trim());
  return shiprocketApi(storeId, "GET", `/courier/track/awb/${encoded}`);
};

const extractTrackingStatus = (trackingPayload = {}) => {
  const trackingData = trackingPayload.tracking_data || trackingPayload.data || trackingPayload;
  const shipmentTrack = Array.isArray(trackingData?.shipment_track)
    ? trackingData.shipment_track[0]
    : trackingData?.shipment_track;

  return (
    trackingPayload.current_status ||
    trackingPayload.shipment_status ||
    trackingPayload.status ||
    shipmentTrack?.current_status ||
    shipmentTrack?.shipment_status ||
    trackingData?.current_status ||
    trackingData?.shipment_status ||
    null
  );
};

const extractTrackingUrl = (assignPayload = {}, trackingPayload = {}) => {
  return (
    assignPayload.response?.data?.tracking_url ||
    assignPayload.tracking_url ||
    trackingPayload.tracking_data?.track_url ||
    trackingPayload.track_url ||
    null
  );
};

const applyShiprocketStatusToOrder = async ({
  storeId,
  orderId,
  shiprocketStatus,
  note,
  createdBy = null,
}) => {
  const mappedStatus = mapShiprocketStatus(shiprocketStatus);
  if (!mappedStatus) {
    return { updated: false, reason: "unmapped_status", shiprocketStatus };
  }

  const existing = await query("SELECT id, order_status FROM orders WHERE id = ? AND store_id = ?", [
    orderId,
    storeId,
  ]);
  if (!existing.length) {
    return { updated: false, reason: "order_not_found" };
  }

  const previousStatus = existing[0].order_status;
  const timelineNote = note || `Shiprocket status: ${shiprocketStatus}`;

  await query(
    `UPDATE orders
     SET order_status = ?,
         delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
     WHERE id = ? AND store_id = ?`,
    [mappedStatus, mappedStatus, orderId, storeId]
  );

  if (previousStatus !== mappedStatus) {
    await query(
      "INSERT INTO order_timeline (store_id, order_id, status, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [storeId, orderId, mappedStatus, timelineNote, createdBy]
    );
  }

  return { updated: true, order_status: mappedStatus, previous_status: previousStatus };
};

const findOrderByTrackingReference = async (reference) => {
  const value = String(reference || "").trim();
  if (!value) return null;

  const rows = await query(
    `SELECT id, store_id, order_number, awb_code, tracking_number, order_status
     FROM orders
     WHERE awb_code = ? OR tracking_number = ?
     ORDER BY id DESC
     LIMIT 1`,
    [value, value]
  );

  return rows.length ? rows[0] : null;
};



const generateShiprocketLabel = async (storeId, shipmentId) => {
  return shiprocketApi(storeId, "POST", "/courier/generate/label", {
    shipment_id: [Number(shipmentId)],
  });
};

const requestShiprocketPickup = async (storeId, shipmentId) => {
  return shiprocketApi(storeId, "POST", "/courier/generate/pickup", {
    shipment_id: [Number(shipmentId)],
  });
};

module.exports.mapShiprocketStatus = mapShiprocketStatus;
module.exports.getShiprocketConfig = getShiprocketConfig;
module.exports.shiprocketApi = shiprocketApi;
module.exports.buildAdhocOrderPayload = buildAdhocOrderPayload;
module.exports.createAdhocOrder = createAdhocOrder;
module.exports.assignAwb = assignAwb;
module.exports.trackByAwb = trackByAwb;
module.exports.extractTrackingStatus = extractTrackingStatus;
module.exports.extractTrackingUrl = extractTrackingUrl;
module.exports.applyShiprocketStatusToOrder = applyShiprocketStatusToOrder;
module.exports.findOrderByTrackingReference = findOrderByTrackingReference;
module.exports.generateShiprocketLabel = generateShiprocketLabel;
module.exports.requestShiprocketPickup = requestShiprocketPickup;
