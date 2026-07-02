const logger = require("../config/logger");
const { errorResponse } = require("../helpers/responseHelper");
const errorHandler = (err, req, res, next) => {
  logger.error(err.stack || err.message);

  if (err.code === "ER_DUP_ENTRY") {
    return errorResponse(res, "Duplicate entry. This record already exists.", 409);
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return errorResponse(res, "Referenced record not found.", 400);
  }

  if (err.type === "entity.parse.failed") {
    return errorResponse(res, "Invalid JSON in request body", 400);
  }

  return errorResponse(res, process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message, 500);
};

const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route ${req.originalUrl} not found`, 404);
};

module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
