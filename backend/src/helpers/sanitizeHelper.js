const xss = require("xss");
const sanitizeInput = (input) => {
  if (typeof input === "string") {
    return xss(input.trim());
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
};

const sanitizeMiddleware = (req, res, next) => {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  if (req.params) req.params = sanitizeInput(req.params);
  next();
};

module.exports.sanitizeInput = sanitizeInput;
module.exports.sanitizeMiddleware = sanitizeMiddleware;
