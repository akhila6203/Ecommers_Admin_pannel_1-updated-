const { resolveStoreId } = require("../helpers/storeHelper");
const storeMiddleware = (req, res, next) => {
  req.storeId = resolveStoreId(req.headers["x-store-id"], req.query.store_id);
  next();
};

module.exports.storeMiddleware = storeMiddleware;
