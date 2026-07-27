const { query } = require("../config/db");

const parseBoolean = (value, fallback = false) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
};

const parseAmount = (value, fallback = 0) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

/**
 * Store-wise shipping settings fetch chesthundi.
 */
const getStoreShippingSettings = async (storeId) => {
  const rows = await query(
    `SELECT key_name, value, type
     FROM settings
     WHERE store_id = ?
       AND group_name = 'shipping'
       AND key_name IN (
         'shipping_enabled',
         'shipping_charge',
         'free_shipping_enabled',
         'free_shipping_above',
         'shipping_label',
         'estimated_delivery_days'
       )`,
    [storeId]
  );

  const rawSettings = {};

  for (const row of rows) {
    rawSettings[row.key_name] = row.value;
  }

  return {
    /*
     * Missing shipping setting unte safe default:
     * shipping OFF → free delivery.
     */
    shipping_enabled: parseBoolean(
      rawSettings.shipping_enabled,
      false
    ),

    shipping_charge: parseAmount(
      rawSettings.shipping_charge,
      0
    ),

    free_shipping_enabled: parseBoolean(
      rawSettings.free_shipping_enabled,
      false
    ),

    free_shipping_above: parseAmount(
      rawSettings.free_shipping_above,
      0
    ),

    shipping_label:
      String(
        rawSettings.shipping_label ||
          "Standard Delivery"
      ).trim(),

    estimated_delivery_days:
      String(
        rawSettings.estimated_delivery_days ||
          "5-7 Days"
      ).trim(),
  };
};

/**
 * Final shipping amount backend decide chesthundi.
 *
 * shipping_enabled OFF:
 *   always 0
 *
 * shipping_enabled ON and free_shipping_enabled OFF:
 *   always configured shipping charge
 *
 * shipping_enabled ON and free_shipping_enabled ON:
 *   threshold reach ayithe free, otherwise charge
 */
const calculateStoreShippingCharge = async ({
  storeId,
  subtotal,
}) => {
  const settings =
    await getStoreShippingSettings(storeId);

  const orderSubtotal = parseAmount(subtotal, 0);

  if (!settings.shipping_enabled) {
    return {
      shippingCharge: 0,
      isFreeShipping: true,
      settings,
    };
  }

  if (
    settings.free_shipping_enabled &&
    settings.free_shipping_above > 0 &&
    orderSubtotal >= settings.free_shipping_above
  ) {
    return {
      shippingCharge: 0,
      isFreeShipping: true,
      settings,
    };
  }

  return {
    shippingCharge: settings.shipping_charge,
    isFreeShipping:
      settings.shipping_charge === 0,
    settings,
  };
};



const extractDeliveryDayRange = (
  value = "5-7 Days"
) => {
  const numbers = String(value)
    .match(/\d+/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];

  if (!numbers.length) {
    return {
      minimumDays: 5,
      maximumDays: 7,
    };
  }

  if (numbers.length === 1) {
    return {
      minimumDays: numbers[0],
      maximumDays: numbers[0],
    };
  }

  return {
    minimumDays: Math.min(...numbers),
    maximumDays: Math.max(...numbers),
  };
};

const addCalendarDays = (
  startDate,
  days
) => {
  const date = new Date(startDate);

  date.setHours(0, 0, 0, 0);
  date.setDate(
    date.getDate() + Number(days || 0)
  );

  return date;
};

const formatMysqlDate = (
  value
) => {
  const date = new Date(value);

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const calculateEstimatedDelivery = ({
  estimatedDeliveryDays,
  orderDate = new Date(),
}) => {
  const deliveryText =
    String(
      estimatedDeliveryDays ||
        "5-7 Days"
    ).trim();

  const {
    minimumDays,
    maximumDays,
  } = extractDeliveryDayRange(
    deliveryText
  );

  const minimumDate =
    addCalendarDays(
      orderDate,
      minimumDays
    );

  const maximumDate =
    addCalendarDays(
      orderDate,
      maximumDays
    );

  return {
    estimatedDeliveryDays:
      deliveryText,

    minimumDays,
    maximumDays,

    minimumDate:
      formatMysqlDate(
        minimumDate
      ),

    maximumDate:
      formatMysqlDate(
        maximumDate
      ),
  };
};

module.exports = {
  getStoreShippingSettings,
  calculateStoreShippingCharge,
  extractDeliveryDayRange,
  calculateEstimatedDelivery,
};








// const { query } = require("../config/db");

// const parseBoolean = (value, fallback = false) => {
//   if (value === null || value === undefined || value === "") {
//     return fallback;
//   }

//   if (typeof value === "boolean") {
//     return value;
//   }

//   if (typeof value === "number") {
//     return value === 1;
//   }

//   return ["true", "1", "yes", "on"].includes(
//     String(value).trim().toLowerCase()
//   );
// };

// const parseAmount = (value, fallback = 0) => {
//   const parsed = Number(value);

//   if (!Number.isFinite(parsed) || parsed < 0) {
//     return fallback;
//   }

//   return parsed;
// };

// /**
//  * Store-wise shipping settings fetch chesthundi.
//  */
// const getStoreShippingSettings = async (storeId) => {
//   const rows = await query(
//     `SELECT key_name, value, type
//      FROM settings
//      WHERE store_id = ?
//        AND group_name = 'shipping'
//        AND key_name IN (
//          'shipping_enabled',
//          'shipping_charge',
//          'free_shipping_enabled',
//          'free_shipping_above',
//          'shipping_label',
//          'estimated_delivery_days'
//        )`,
//     [storeId]
//   );

//   const rawSettings = {};

//   for (const row of rows) {
//     rawSettings[row.key_name] = row.value;
//   }

//   return {
//     /*
//      * Missing shipping setting unte safe default:
//      * shipping OFF → free delivery.
//      */
//     shipping_enabled: parseBoolean(
//       rawSettings.shipping_enabled,
//       false
//     ),

//     shipping_charge: parseAmount(
//       rawSettings.shipping_charge,
//       0
//     ),

//     free_shipping_enabled: parseBoolean(
//       rawSettings.free_shipping_enabled,
//       false
//     ),

//     free_shipping_above: parseAmount(
//       rawSettings.free_shipping_above,
//       0
//     ),

//     shipping_label:
//       String(
//         rawSettings.shipping_label ||
//           "Standard Delivery"
//       ).trim(),

//     estimated_delivery_days:
//       String(
//         rawSettings.estimated_delivery_days ||
//           "5-7 Days"
//       ).trim(),
//   };
// };

// /**
//  * Final shipping amount backend decide chesthundi.
//  *
//  * shipping_enabled OFF:
//  *   always 0
//  *
//  * shipping_enabled ON and free_shipping_enabled OFF:
//  *   always configured shipping charge
//  *
//  * shipping_enabled ON and free_shipping_enabled ON:
//  *   threshold reach ayithe free, otherwise charge
//  */
// const calculateStoreShippingCharge = async ({
//   storeId,
//   subtotal,
// }) => {
//   const settings =
//     await getStoreShippingSettings(storeId);

//   const orderSubtotal = parseAmount(subtotal, 0);

//   if (!settings.shipping_enabled) {
//     return {
//       shippingCharge: 0,
//       isFreeShipping: true,
//       settings,
//     };
//   }

//   if (
//     settings.free_shipping_enabled &&
//     settings.free_shipping_above > 0 &&
//     orderSubtotal >= settings.free_shipping_above
//   ) {
//     return {
//       shippingCharge: 0,
//       isFreeShipping: true,
//       settings,
//     };
//   }

//   return {
//     shippingCharge: settings.shipping_charge,
//     isFreeShipping:
//       settings.shipping_charge === 0,
//     settings,
//   };
// };

// module.exports = {
//   getStoreShippingSettings,
//   calculateStoreShippingCharge,
// };