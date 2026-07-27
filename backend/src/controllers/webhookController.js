const { query } = require("../config/db");
const { successResponse } = require("../helpers/responseHelper");
const {
  applyShiprocketStatusToOrder,
  findOrderByTrackingReference,
  mapShiprocketStatus,
} = require("../helpers/shiprocketHelper");
const logger = require("../config/logger");
const extractWebhookReference = (body = {}) =>
  body.awb ||
  body.awb_code ||
  body.AWB ||
  body.tracking_number ||
  body.tracking_no ||
  body.shipment?.awb ||
  body.shipment?.awb_code ||
  body.data?.awb ||
  body.data?.awb_code ||
  null;

const extractWebhookStatus = (body = {}) =>
  body.current_status ||
  body.shipment_status ||
  body.status ||
  body.shipment?.status ||
  body.data?.current_status ||
  body.data?.shipment_status ||
  body.scans?.[0]?.status ||
  null;

  const normalizeMysqlDate = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const directMatch = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const handleShiprocketWebhook = async (req, res) => {
  try {
    const body = req.body || {};
    const reference = extractWebhookReference(body);
    const shiprocketStatus = extractWebhookStatus(body);

    logger.info("Shiprocket webhook received", {
      reference,
      shiprocketStatus,
    });

    if (!reference) {
      return successResponse(res, { processed: false, reason: "missing_awb" }, "Webhook received");
    }

    const order = await findOrderByTrackingReference(reference);
    if (!order) {
      logger.warn("Shiprocket webhook: order not found for reference", { reference });
      return successResponse(res, { processed: false, reason: "order_not_found" }, "Webhook received");
    }

    // if (!shiprocketStatus) {
    //   return successResponse(res, { processed: false, reason: "missing_status", order_id: order.id }, "Webhook received");
    // }

    // const mappedStatus = mapShiprocketStatus(shiprocketStatus);
    // if (!mappedStatus) {
    //   return successResponse(
    //     res,
    //     { processed: false, reason: "unmapped_status", shiprocketStatus, order_id: order.id },
    //     "Webhook received"
    //   );
    // }

    const courierName =
      body.courier_name || body.courier || body.shipment?.courier_name || body.data?.courier_name || null;
    const trackingUrl =
      body.tracking_url || body.track_url || body.shipment?.tracking_url || body.data?.tracking_url || null;


  //     const courierEstimatedDelivery =
  // body.estimated_delivery_date ||
  // body.expected_delivery_date ||
  // body.etd ||
  // body.edd ||
  // body.shipment
  //   ?.estimated_delivery_date ||
  // body.shipment
  //   ?.expected_delivery_date ||
  // body.data
  //   ?.estimated_delivery_date ||
  // body.data
  //   ?.expected_delivery_date ||
  // body.data?.etd ||
  // body.data?.edd ||
  // null;
  const courierEstimatedDeliveryRaw =
  body.estimated_delivery_date ||
  body.expected_delivery_date ||
  body.etd ||
  body.edd ||
  body.shipment
    ?.estimated_delivery_date ||
  body.shipment
    ?.expected_delivery_date ||
  body.data
    ?.estimated_delivery_date ||
  body.data
    ?.expected_delivery_date ||
  body.data?.etd ||
  body.data?.edd ||
  null;

const courierEstimatedDelivery =
  normalizeMysqlDate(
    courierEstimatedDeliveryRaw
  );


    // if (courierName || trackingUrl) {
    //   await query(
    //     `UPDATE orders
    //      SET courier_name = COALESCE(?, courier_name),
    //          tracking_url = COALESCE(?, tracking_url),
    //          awb_code = COALESCE(awb_code, ?),
    //          tracking_number = COALESCE(tracking_number, ?)
    //      WHERE id = ? AND store_id = ?`,
    //     [courierName, trackingUrl, reference, reference, order.id, order.store_id]
    //   );
    // }

    if (
  courierName ||
  trackingUrl ||
  courierEstimatedDelivery
) {
  await query(
    `UPDATE orders
     SET courier_name =
           COALESCE(
             ?,
             courier_name
           ),

         tracking_url =
           COALESCE(
             ?,
             tracking_url
           ),

         awb_code =
           COALESCE(
             awb_code,
             ?
           ),

         tracking_number =
           COALESCE(
             tracking_number,
             ?
           ),

         courier_estimated_delivery =
  COALESCE(
    ?,
    courier_estimated_delivery
  )

     WHERE id = ?
       AND store_id = ?`,
    [
      courierName,
      trackingUrl,
      reference,
      reference,
      courierEstimatedDelivery,
      order.id,
      order.store_id,
    ]
  );
}


if (!shiprocketStatus) {
  return successResponse(
    res,
    {
      processed: Boolean(
        courierName ||
        trackingUrl ||
        courierEstimatedDelivery
      ),

      status_processed: false,

      courier_data_processed: Boolean(
        courierName ||
        trackingUrl ||
        courierEstimatedDelivery
      ),

      reason: "missing_status",

      order_id: order.id,
      store_id: order.store_id,
    },
    "Webhook received"
  );
}

const mappedStatus =
  mapShiprocketStatus(
    shiprocketStatus
  );

if (!mappedStatus) {
  return successResponse(
    res,
    {
      processed: Boolean(
        courierName ||
        trackingUrl ||
        courierEstimatedDelivery
      ),

      status_processed: false,

      courier_data_processed: Boolean(
        courierName ||
        trackingUrl ||
        courierEstimatedDelivery
      ),

      reason: "unmapped_status",

      shiprocketStatus,

      order_id: order.id,
      store_id: order.store_id,
    },
    "Webhook received"
  );
}


    const result = await applyShiprocketStatusToOrder({
      storeId: order.store_id,
      orderId: order.id,
      shiprocketStatus,
      note: `Shiprocket webhook: ${shiprocketStatus}`,
      createdBy: null,
    });

    // return successResponse(
    //   res,
    //   {
    //     processed: true,
    //     order_id: order.id,
    //     store_id: order.store_id,
    //     order_status: result.order_status,
    //   },
    //   "Webhook processed"
    // );
    return successResponse(
  res,
  {
    processed: true,

    courier_data_processed: Boolean(
      courierName ||
      trackingUrl ||
      courierEstimatedDelivery
    ),

    order_id: order.id,
    store_id: order.store_id,
    order_status: result.order_status,

    courier_estimated_delivery:
      courierEstimatedDelivery,
  },
  "Webhook processed"
);
  } catch (error) {
    logger.error("Shiprocket webhook error:", error);
    return successResponse(res, { processed: false, reason: "internal_error" }, "Webhook received");
  }
};

module.exports.handleShiprocketWebhook = handleShiprocketWebhook;




// const { query } = require("../config/db");
// const { successResponse } = require("../helpers/responseHelper");
// const {
//   applyShiprocketStatusToOrder,
//   findOrderByTrackingReference,
//   mapShiprocketStatus,
// } = require("../helpers/shiprocketHelper");
// const logger = require("../config/logger");
// const extractWebhookReference = (body = {}) =>
//   body.awb ||
//   body.awb_code ||
//   body.AWB ||
//   body.tracking_number ||
//   body.tracking_no ||
//   body.shipment?.awb ||
//   body.shipment?.awb_code ||
//   body.data?.awb ||
//   body.data?.awb_code ||
//   null;

// const extractWebhookStatus = (body = {}) =>
//   body.current_status ||
//   body.shipment_status ||
//   body.status ||
//   body.shipment?.status ||
//   body.data?.current_status ||
//   body.data?.shipment_status ||
//   body.scans?.[0]?.status ||
//   null;

// const handleShiprocketWebhook = async (req, res) => {
//   try {
//     const body = req.body || {};
//     const reference = extractWebhookReference(body);
//     const shiprocketStatus = extractWebhookStatus(body);

//     logger.info("Shiprocket webhook received", {
//       reference,
//       shiprocketStatus,
//     });

//     if (!reference) {
//       return successResponse(res, { processed: false, reason: "missing_awb" }, "Webhook received");
//     }

//     const order = await findOrderByTrackingReference(reference);
//     if (!order) {
//       logger.warn("Shiprocket webhook: order not found for reference", { reference });
//       return successResponse(res, { processed: false, reason: "order_not_found" }, "Webhook received");
//     }

//     if (!shiprocketStatus) {
//       return successResponse(res, { processed: false, reason: "missing_status", order_id: order.id }, "Webhook received");
//     }

//     const mappedStatus = mapShiprocketStatus(shiprocketStatus);
//     if (!mappedStatus) {
//       return successResponse(
//         res,
//         { processed: false, reason: "unmapped_status", shiprocketStatus, order_id: order.id },
//         "Webhook received"
//       );
//     }

//     const courierName =
//       body.courier_name || body.courier || body.shipment?.courier_name || body.data?.courier_name || null;
//     const trackingUrl =
//       body.tracking_url || body.track_url || body.shipment?.tracking_url || body.data?.tracking_url || null;

//     if (courierName || trackingUrl) {
//       await query(
//         `UPDATE orders
//          SET courier_name = COALESCE(?, courier_name),
//              tracking_url = COALESCE(?, tracking_url),
//              awb_code = COALESCE(awb_code, ?),
//              tracking_number = COALESCE(tracking_number, ?)
//          WHERE id = ? AND store_id = ?`,
//         [courierName, trackingUrl, reference, reference, order.id, order.store_id]
//       );
//     }

//     const result = await applyShiprocketStatusToOrder({
//       storeId: order.store_id,
//       orderId: order.id,
//       shiprocketStatus,
//       note: `Shiprocket webhook: ${shiprocketStatus}`,
//       createdBy: null,
//     });

//     return successResponse(
//       res,
//       {
//         processed: true,
//         order_id: order.id,
//         store_id: order.store_id,
//         order_status: result.order_status,
//       },
//       "Webhook processed"
//     );
//   } catch (error) {
//     logger.error("Shiprocket webhook error:", error);
//     return successResponse(res, { processed: false, reason: "internal_error" }, "Webhook received");
//   }
// };

// module.exports.handleShiprocketWebhook = handleShiprocketWebhook;
