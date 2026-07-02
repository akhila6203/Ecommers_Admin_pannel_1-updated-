const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const wishlistSelect = `
  SELECT
    w.id AS wishlist_id,
    w.product_id,
    w.created_at AS added_at,
    p.name,
    p.slug,
    p.price,
    p.offer_price,
    p.thumbnail,
    p.stock,
    p.status AS product_status
  FROM wishlists w
  INNER JOIN products p ON p.id = w.product_id AND p.store_id = w.store_id
`;

const getWishlist = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;

    const rows = await query(
      `${wishlistSelect}
       WHERE w.store_id = ? AND w.customer_id = ?
       ORDER BY w.created_at DESC`,
      [storeId, customerId]
    );

    const wishlist = rows.map((row) => ({
      wishlist_id: row.wishlist_id,
      product_id: row.product_id,
      name: row.name,
      slug: row.slug,
      price: Number(row.offer_price || row.price || 0),
      old_price: Number(row.price || 0),
      thumbnail: row.thumbnail,
      stock: Number(row.stock || 0),
      in_stock: Number(row.stock || 0) > 0,
      product_status: row.product_status,
      added_at: row.added_at,
    }));

    return successResponse(res, wishlist, "Wishlist fetched successfully");
  } catch (error) {
    logger.error("Get wishlist error:", error);
    return errorResponse(res, "Failed to fetch wishlist", 500);
  }
};

const addToWishlist = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const { product_id } = req.body;

    if (!product_id) {
      return errorResponse(res, "Product id is required", 400);
    }

    const products = await query(
      "SELECT id FROM products WHERE id = ? AND store_id = ? AND status = 'active'",
      [product_id, storeId]
    );
    if (!products.length) {
      return errorResponse(res, "Product not found", 404);
    }

    const existing = await query(
      "SELECT id FROM wishlists WHERE store_id = ? AND customer_id = ? AND product_id = ?",
      [storeId, customerId, product_id]
    );
    if (existing.length) {
      return successResponse(res, { wishlist_id: existing[0].id }, "Already in wishlist");
    }

    const result = await query(
      "INSERT INTO wishlists (store_id, customer_id, product_id) VALUES (?, ?, ?)",
      [storeId, customerId, product_id]
    );

    return successResponse(res, { wishlist_id: result.insertId }, "Added to wishlist", 201);
  } catch (error) {
    logger.error("Add wishlist error:", error);
    return errorResponse(res, "Failed to add to wishlist", 500);
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const productId = req.params.productId;

    const result = await query(
      "DELETE FROM wishlists WHERE store_id = ? AND customer_id = ? AND product_id = ?",
      [storeId, customerId, productId]
    );

    if (result?.affectedRows === 0) {
      return errorResponse(res, "Item not found in wishlist", 404);
    }

    return successResponse(res, null, "Removed from wishlist");
  } catch (error) {
    logger.error("Remove wishlist error:", error);
    return errorResponse(res, "Failed to remove from wishlist", 500);
  }
};

const toggleWishlist = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const { product_id } = req.body;

    if (!product_id) {
      return errorResponse(res, "Product id is required", 400);
    }

    const existing = await query(
      "SELECT id FROM wishlists WHERE store_id = ? AND customer_id = ? AND product_id = ?",
      [storeId, customerId, product_id]
    );

    if (existing.length) {
      await query("DELETE FROM wishlists WHERE id = ? AND store_id = ?", [existing[0].id, storeId]);
      return successResponse(res, { in_wishlist: false }, "Removed from wishlist");
    }

    const products = await query(
      "SELECT id FROM products WHERE id = ? AND store_id = ? AND status = 'active'",
      [product_id, storeId]
    );
    if (!products.length) {
      return errorResponse(res, "Product not found", 404);
    }

    const result = await query(
      "INSERT INTO wishlists (store_id, customer_id, product_id) VALUES (?, ?, ?)",
      [storeId, customerId, product_id]
    );

    return successResponse(res, { in_wishlist: true, wishlist_id: result.insertId }, "Added to wishlist");
  } catch (error) {
    logger.error("Toggle wishlist error:", error);
    return errorResponse(res, "Failed to update wishlist", 500);
  }
};

const checkWishlist = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const productId = req.params.productId;

    const rows = await query(
      "SELECT id FROM wishlists WHERE store_id = ? AND customer_id = ? AND product_id = ?",
      [storeId, customerId, productId]
    );

    return successResponse(res, { in_wishlist: rows.length > 0, wishlist_id: rows[0]?.id || null });
  } catch (error) {
    logger.error("Check wishlist error:", error);
    return errorResponse(res, "Failed to check wishlist", 500);
  }
};

module.exports.getWishlist = getWishlist;
module.exports.addToWishlist = addToWishlist;
module.exports.removeFromWishlist = removeFromWishlist;
module.exports.toggleWishlist = toggleWishlist;
module.exports.checkWishlist = checkWishlist;
