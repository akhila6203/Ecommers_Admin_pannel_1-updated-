const { errorResponse } = require("../helpers/responseHelper");
const validateCategory = (req, res, next) => {
  const { name } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Category name is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateSubCategory = (req, res, next) => {
  const { name, main_category_id } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Sub category name is required");
  }
  if (!main_category_id) {
    errors.push("Main category ID is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateSubCategoryUpdate = (req, res, next) => {
  const { name } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Sub category name is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateChildCategory = (req, res, next) => {
  const { name, sub_category_id } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Child category name is required");
  }
  if (!sub_category_id) {
    errors.push("Sub category ID is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

const validateChildCategoryUpdate = (req, res, next) => {
  const { name } = req.body;
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Child category name is required");
  }

  if (errors.length) return errorResponse(res, "Validation failed", 400, errors);
  next();
};

module.exports.validateCategory = validateCategory;
module.exports.validateSubCategory = validateSubCategory;
module.exports.validateSubCategoryUpdate = validateSubCategoryUpdate;
module.exports.validateChildCategory = validateChildCategory;
module.exports.validateChildCategoryUpdate = validateChildCategoryUpdate;
