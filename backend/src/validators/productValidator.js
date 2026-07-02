const { errorResponse } = require("../helpers/responseHelper");
const validateProduct = (req, res, next) => {
  const { name, price, category_id } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Product name is required");
  }
  if (!price || isNaN(price) || Number(price) <= 0) {
    errors.push("Valid price is required");
  }
  if (!category_id) {
    errors.push("Category is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateVariantOption = (req, res, next) => {
  const { option_name, option_values } = req.body;
  const errors = [];

  if (!option_name || typeof option_name !== "string" || !option_name.trim()) {
    errors.push("Option name is required");
  }
  if (!option_values) {
    errors.push("Option values are required");
  } else {
    try {
      const values = Array.isArray(option_values) ? option_values : JSON.parse(option_values);
      if (!Array.isArray(values) || values.length === 0) {
        errors.push("Option values must be a non-empty array");
      }
    } catch {
      errors.push("Option values must be a valid JSON array");
    }
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateProductSeo = (req, res, next) => {
  const errors = [];
  const { seo_title, canonical_url } = req.body;

  if (seo_title && typeof seo_title !== "string") {
    errors.push("SEO title must be a string");
  }
  if (canonical_url && typeof canonical_url !== "string") {
    errors.push("Canonical URL must be a string");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

module.exports.validateProduct = validateProduct;
module.exports.validateVariantOption = validateVariantOption;
module.exports.validateProductSeo = validateProductSeo;
