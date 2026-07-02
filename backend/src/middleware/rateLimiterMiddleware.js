const rateLimit = require("express-rate-limit");
const logger = require("../config/logger");
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 5000,
  skip: () => process.env.NODE_ENV === "development",
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded: ${req.method} ${req.originalUrl} from ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});
// const apiLimiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
//   max: parseInt(process.env.RATE_LIMIT_MAX) || 10000,
//   message: {
//     success: false,
//     message: "Too many requests, please try again later.",
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: (req, res, next, options) => {
//     logger.warn(`Rate limit exceeded: ${req.method} ${req.originalUrl} from ${req.ip}`);
//     res.status(options.statusCode).json(options.message);
//   },
// });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: "Too many uploads, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports.apiLimiter = apiLimiter;
module.exports.authLimiter = authLimiter;
module.exports.uploadLimiter = uploadLimiter;
