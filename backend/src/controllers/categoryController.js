const { query } = require("../config/db");
const { generateUniqueSlug } = require("../helpers/slugHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const MAIN_COLUMNS = "id, name, slug, image, image_url, created_at, updated_at";
const SUB_COLUMNS = "id, main_category_id, name, slug, image, image_url, created_at, updated_at";
const CHILD_COLUMNS = "id, sub_category_id, name, slug, image, image_url, created_at, updated_at";

const categoryImagePath = (file) => (file ? `uploads/categories/${file.filename}` : null);

const normalizeCategoryRow = (row) => {
  if (!row) return row;
  const imageUrl = row.image_url || row.image || null;
  return { ...row, image_url: imageUrl, image: imageUrl };
};

const checkCategorySlug = async (slug, storeId, excludeId = null) => {
  let sql = "SELECT id FROM categories WHERE slug = ? AND store_id = ?";
  const params = [slug, storeId];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.length > 0 ? result[0] : null;
};

const checkSubCategorySlug = async (slug, storeId, excludeId = null) => {
  let sql = "SELECT id FROM sub_categories WHERE slug = ? AND store_id = ?";
  const params = [slug, storeId];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.length > 0 ? result[0] : null;
};

const checkChildCategorySlug = async (slug, storeId, excludeId = null) => {
  let sql = "SELECT id FROM child_categories WHERE slug = ? AND store_id = ?";
  const params = [slug, storeId];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.length > 0 ? result[0] : null;
};

const getCategories = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    let whereClause = "WHERE c.store_id = ?";
    const params = [storeId];

    if (search) {
      whereClause += " AND (c.name LIKE ? OR c.slug LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM categories c ${whereClause}`, params);
    const total = countResult[0].total;

    const categories = await query(
      `SELECT c.id, c.name, c.slug, c.image, c.image_url, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM sub_categories WHERE main_category_id = c.id AND store_id = ?) as sub_category_count,
        (SELECT COUNT(*) FROM products WHERE category_id = c.id AND store_id = ?) as product_count
       FROM categories c ${whereClause}
       ORDER BY c.name ASC
       LIMIT ? OFFSET ?`,
      [storeId, storeId, ...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, categories.map(normalizeCategoryRow), total, page, limit);
  } catch (error) {
    logger.error("Get categories error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch categories", 500);
  }
};

const getAllCategories = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const categories = await query(
      `SELECT id, name, slug FROM categories WHERE store_id = ? ORDER BY name ASC`,
      [storeId]
    );
    return successResponse(res, categories);
  } catch (error) {
    logger.error("Get all categories error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch categories", 500);
  }
};

const getCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const categories = await query(`SELECT ${MAIN_COLUMNS} FROM categories WHERE id = ? AND store_id = ?`, [req.params.id, storeId]);
    if (!categories.length) {
      return errorResponse(res, "Category not found", 404);
    }

    const subCategories = await query(
      `SELECT ${SUB_COLUMNS} FROM sub_categories WHERE main_category_id = ? AND store_id = ? ORDER BY name ASC`,
      [req.params.id, storeId]
    );

    return successResponse(res, {
      ...normalizeCategoryRow(categories[0]),
      sub_categories: subCategories.map(normalizeCategoryRow),
    });
  } catch (error) {
    logger.error("Get category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch category", 500);
  }
};

const createCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name } = req.body;
    const slug = await generateUniqueSlug((s, id) => checkCategorySlug(s, storeId, id), name);
    const imagePath = categoryImagePath(req.file);

    const result = await query(
      "INSERT INTO categories (store_id, name, slug, image, image_url) VALUES (?, ?, ?, ?, ?)",
      [storeId, name, slug, imagePath, imagePath]
    );

    const category = await query(`SELECT ${MAIN_COLUMNS} FROM categories WHERE id = ? AND store_id = ?`, [result.insertId, storeId]);
    return successResponse(res, normalizeCategoryRow(category[0]), "Category created successfully", 201);
  } catch (error) {
    logger.error("Create category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to create category", 500);
  }
};

const updateCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name } = req.body;
    const categoryId = req.params.id;

    const existing = await query(`SELECT ${MAIN_COLUMNS} FROM categories WHERE id = ? AND store_id = ?`, [categoryId, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Category not found", 404);
    }

    let slug = existing[0].slug;
    if (name && name !== existing[0].name) {
      slug = await generateUniqueSlug((s, id) => checkCategorySlug(s, storeId, id), name, categoryId);
    }

    const imagePath = req.file
      ? categoryImagePath(req.file)
      : existing[0].image_url || existing[0].image || null;

    await query(
      "UPDATE categories SET name = ?, slug = ?, image = ?, image_url = ? WHERE id = ? AND store_id = ?",
      [name || existing[0].name, slug, imagePath, imagePath, categoryId, storeId]
    );

    const category = await query(`SELECT ${MAIN_COLUMNS} FROM categories WHERE id = ? AND store_id = ?`, [categoryId, storeId]);
    return successResponse(res, normalizeCategoryRow(category[0]), "Category updated successfully");
  } catch (error) {
    logger.error("Update category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to update category", 500);
  }
};

const deleteCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Category not found", 404);
    }

    await query("DELETE FROM categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Category deleted successfully");
  } catch (error) {
    logger.error("Delete category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to delete category", 500);
  }
};

const toggleCategoryStatus = async (req, res) => {
  return errorResponse(res, "Category status is not used in admin UI", 400);
};

const getSubCategories = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { mainId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE sc.store_id = ?";
    const params = [storeId];
    if (mainId !== "all") {
      whereClause += " AND sc.main_category_id = ?";
      params.push(mainId);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM sub_categories sc ${whereClause}`, params);
    const total = countResult[0].total;

    const subCategories = await query(
      `SELECT sc.id, sc.main_category_id, sc.name, sc.slug, sc.image, sc.image_url, sc.created_at, sc.updated_at,
        c.name as main_category_name,
        (SELECT COUNT(*) FROM child_categories WHERE sub_category_id = sc.id AND store_id = ?) as child_count
       FROM sub_categories sc
       LEFT JOIN categories c ON sc.main_category_id = c.id AND c.store_id = sc.store_id
       ${whereClause}
       ORDER BY sc.name ASC
       LIMIT ? OFFSET ?`,
      [storeId, ...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, subCategories.map(normalizeCategoryRow), total, page, limit);
  } catch (error) {
    logger.error("Get sub categories error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch sub categories", 500);
  }
};

const createSubCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, main_category_id } = req.body;
    const slug = await generateUniqueSlug((s, id) => checkSubCategorySlug(s, storeId, id), name);

    const imagePath = categoryImagePath(req.file);

    const result = await query(
      "INSERT INTO sub_categories (store_id, name, slug, main_category_id, image, image_url) VALUES (?, ?, ?, ?, ?, ?)",
      [storeId, name, slug, main_category_id, imagePath, imagePath]
    );

    const subCategory = await query(`SELECT ${SUB_COLUMNS} FROM sub_categories WHERE id = ? AND store_id = ?`, [result.insertId, storeId]);
    return successResponse(res, normalizeCategoryRow(subCategory[0]), "Sub category created successfully", 201);
  } catch (error) {
    logger.error("Create sub category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to create sub category", 500);
  }
};

const updateSubCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, main_category_id } = req.body;
    const subId = req.params.id;

    const existing = await query(`SELECT ${SUB_COLUMNS} FROM sub_categories WHERE id = ? AND store_id = ?`, [subId, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Sub category not found", 404);
    }

    let slug = existing[0].slug;
    if (name && name !== existing[0].name) {
      slug = await generateUniqueSlug((s, id) => checkSubCategorySlug(s, storeId, id), name, subId);
    }

    const imagePath = req.file
      ? categoryImagePath(req.file)
      : existing[0].image_url || existing[0].image || null;

    await query(
      "UPDATE sub_categories SET name = ?, slug = ?, main_category_id = ?, image = ?, image_url = ? WHERE id = ? AND store_id = ?",
      [name || existing[0].name, slug, main_category_id || existing[0].main_category_id, imagePath, imagePath, subId, storeId]
    );

    const subCategory = await query(`SELECT ${SUB_COLUMNS} FROM sub_categories WHERE id = ? AND store_id = ?`, [subId, storeId]);
    return successResponse(res, normalizeCategoryRow(subCategory[0]), "Sub category updated successfully");
  } catch (error) {
    logger.error("Update sub category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to update sub category", 500);
  }
};

const deleteSubCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM sub_categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Sub category not found", 404);
    }

    await query("DELETE FROM sub_categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Sub category deleted successfully");
  } catch (error) {
    logger.error("Delete sub category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to delete sub category", 500);
  }
};

const getChildCategories = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { subId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE cc.store_id = ?";
    const params = [storeId];
    if (subId !== "all") {
      whereClause += " AND cc.sub_category_id = ?";
      params.push(subId);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM child_categories cc ${whereClause}`, params);
    const total = countResult[0].total;

    const childCategories = await query(
      `SELECT cc.id, cc.sub_category_id, cc.name, cc.slug, cc.image, cc.image_url, cc.created_at, cc.updated_at,
        sc.name as sub_category_name, c.name as main_category_name
       FROM child_categories cc
       LEFT JOIN sub_categories sc ON cc.sub_category_id = sc.id AND sc.store_id = cc.store_id
       LEFT JOIN categories c ON sc.main_category_id = c.id AND c.store_id = cc.store_id
       ${whereClause}
       ORDER BY cc.name ASC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return paginatedResponse(res, childCategories.map(normalizeCategoryRow), total, page, limit);
  } catch (error) {
    logger.error("Get child categories error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch child categories", 500);
  }
};

const createChildCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, sub_category_id } = req.body;
    const slug = await generateUniqueSlug((s, id) => checkChildCategorySlug(s, storeId, id), name);

    const imagePath = categoryImagePath(req.file);

    const result = await query(
      "INSERT INTO child_categories (store_id, name, slug, sub_category_id, image, image_url) VALUES (?, ?, ?, ?, ?, ?)",
      [storeId, name, slug, sub_category_id, imagePath, imagePath]
    );

    const childCategory = await query(`SELECT ${CHILD_COLUMNS} FROM child_categories WHERE id = ? AND store_id = ?`, [result.insertId, storeId]);
    return successResponse(res, normalizeCategoryRow(childCategory[0]), "Child category created successfully", 201);
  } catch (error) {
    logger.error("Create child category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to create child category", 500);
  }
};

const updateChildCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, sub_category_id } = req.body;
    const childId = req.params.id;

    const existing = await query(`SELECT ${CHILD_COLUMNS} FROM child_categories WHERE id = ? AND store_id = ?`, [childId, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Child category not found", 404);
    }

    let slug = existing[0].slug;
    if (name && name !== existing[0].name) {
      slug = await generateUniqueSlug((s, id) => checkChildCategorySlug(s, storeId, id), name, childId);
    }

    const imagePath = req.file
      ? categoryImagePath(req.file)
      : existing[0].image_url || existing[0].image || null;

    await query(
      "UPDATE child_categories SET name = ?, slug = ?, sub_category_id = ?, image = ?, image_url = ? WHERE id = ? AND store_id = ?",
      [name || existing[0].name, slug, sub_category_id || existing[0].sub_category_id, imagePath, imagePath, childId, storeId]
    );

    const childCategory = await query(`SELECT ${CHILD_COLUMNS} FROM child_categories WHERE id = ? AND store_id = ?`, [childId, storeId]);
    return successResponse(res, normalizeCategoryRow(childCategory[0]), "Child category updated successfully");
  } catch (error) {
    logger.error("Update child category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to update child category", 500);
  }
};

const deleteChildCategory = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM child_categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) {
      return errorResponse(res, "Child category not found", 404);
    }

    await query("DELETE FROM child_categories WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Child category deleted successfully");
  } catch (error) {
    logger.error("Delete child category error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to delete child category", 500);
  }
};

const getCategoryHierarchy = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const categories = await query(
      "SELECT id, name, slug, image, image_url FROM categories WHERE store_id = ? ORDER BY name ASC",
      [storeId]
    );

    for (const cat of categories) {
      normalizeCategoryRow(cat);
      cat.sub_categories = await query(
        "SELECT id, name, slug, main_category_id, image, image_url FROM sub_categories WHERE main_category_id = ? AND store_id = ? ORDER BY name ASC",
        [cat.id, storeId]
      );
      cat.sub_categories = cat.sub_categories.map(normalizeCategoryRow);
      for (const sub of cat.sub_categories) {
        sub.child_categories = await query(
          "SELECT id, name, slug, sub_category_id, image, image_url FROM child_categories WHERE sub_category_id = ? AND store_id = ? ORDER BY name ASC",
          [sub.id, storeId]
        );
        sub.child_categories = sub.child_categories.map(normalizeCategoryRow);
      }
    }

    return successResponse(res, categories);
  } catch (error) {
    logger.error("Get category hierarchy error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to fetch hierarchy", 500);
  }
};

module.exports.getCategories = getCategories;
module.exports.getAllCategories = getAllCategories;
module.exports.getCategory = getCategory;
module.exports.createCategory = createCategory;
module.exports.updateCategory = updateCategory;
module.exports.deleteCategory = deleteCategory;
module.exports.toggleCategoryStatus = toggleCategoryStatus;
module.exports.getSubCategories = getSubCategories;
module.exports.createSubCategory = createSubCategory;
module.exports.updateSubCategory = updateSubCategory;
module.exports.deleteSubCategory = deleteSubCategory;
module.exports.getChildCategories = getChildCategories;
module.exports.createChildCategory = createChildCategory;
module.exports.updateChildCategory = updateChildCategory;
module.exports.deleteChildCategory = deleteChildCategory;
module.exports.getCategoryHierarchy = getCategoryHierarchy;
