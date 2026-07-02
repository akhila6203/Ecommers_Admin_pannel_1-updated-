const DEFAULT_STORE_ID = 1;

const getStoreId = (req) => {
  // Super Admin
  if (req?.admin?.role === "super_admin") {
    const id =
      req.query?.store_id ||
      req.body?.store_id ||
      req.headers["x-store-id"] ||
      DEFAULT_STORE_ID;

    const parsed = parseInt(id, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_STORE_ID : parsed;
  }

  // Store Admin
  const id =
    req?.admin?.store_id ??
    req?.storeId ??
    req?.headers["x-store-id"] ??
    DEFAULT_STORE_ID;

  const parsed = parseInt(id, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_STORE_ID : parsed;
};

const resolveStoreId = (headerValue, queryValue) => {
  if (headerValue !== undefined && headerValue !== null && headerValue !== "") {
    const parsed = parseInt(headerValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  if (queryValue !== undefined && queryValue !== null && queryValue !== "") {
    const parsed = parseInt(queryValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return DEFAULT_STORE_ID;
};

module.exports = {
  DEFAULT_STORE_ID,
  getStoreId,
  resolveStoreId,
};



// const DEFAULT_STORE_ID = 1;

// const getStoreId = (req) => {
//   const id = req?.storeId ?? DEFAULT_STORE_ID;
//   const parsed = parseInt(id, 10);
//   return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_STORE_ID : parsed;
// };

// const resolveStoreId = (headerValue, queryValue) => {
//   if (headerValue !== undefined && headerValue !== null && headerValue !== "") {
//     const parsed = parseInt(headerValue, 10);
//     if (!Number.isNaN(parsed) && parsed > 0) return parsed;
//   }
//   if (queryValue !== undefined && queryValue !== null && queryValue !== "") {
//     const parsed = parseInt(queryValue, 10);
//     if (!Number.isNaN(parsed) && parsed > 0) return parsed;
//   }
//   return DEFAULT_STORE_ID;
// };

// module.exports.DEFAULT_STORE_ID = DEFAULT_STORE_ID;
// module.exports.getStoreId = getStoreId;
// module.exports.resolveStoreId = resolveStoreId;
