const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const {
  resolveCartScope,
  cartWhereClause,
} = require("../helpers/cartHelper");
const safeJsonParse = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseSizes = (itemData, row) => {
  const fromData = Array.isArray(itemData.sizes) ? itemData.sizes : [];
  const fallback = row.size || row.variant_size || "Free Size";
  return fromData.length ? fromData : fallback ? [fallback] : ["Free Size"];
};

const requireCartScope = (req, res) => {
  const scope = resolveCartScope(req);
  const where = cartWhereClause(scope);

  if (!where) {
    errorResponse(res, "Cart session id or login required", 400);
    return null;
  }

  return { scope, where };
};

const getCart = async (req, res) => {
  try {
    const ctx = requireCartScope(req, res);
    if (!ctx) return;

    const { scope } = ctx;
    const where = cartWhereClause(scope, "c");

    const rows = await query(
      `SELECT 
        c.id AS cart_id,
        c.product_id,
        c.variant_id,
        c.quantity AS qty,
        c.selected_size,
        c.selected_color,
        c.selected_size AS size,
        c.selected_color AS color,
        c.item_price,
        c.item_data,
        p.name,
        p.slug,
        p.price,
        p.offer_price,
        p.thumbnail,
        p.stock,
        pv.fabric AS variant_fabric,
        pv.color AS variant_color,
        pv.size AS variant_size
      FROM cart c
      INNER JOIN products p 
        ON p.id = c.product_id 
       AND p.store_id = c.store_id
      LEFT JOIN product_variants pv
        ON pv.id = c.variant_id AND pv.store_id = c.store_id
      WHERE ${where.clause}
      ORDER BY c.updated_at DESC`,
      where.params
    );

    const cart = rows.map((row) => {
      const itemData = safeJsonParse(row.item_data, {});
      const selectedSize =
        row.selected_size || itemData.selected_size || row.variant_size || "Free Size";
      const selectedColor =
        row.selected_color || itemData.selected_color || row.variant_color || "";
        const price = Number(row.item_price || row.offer_price || row.price || 0);
      // const price = Number(row.offer_price || row.price || row.item_price || 0);
      const image = itemData.image || row.thumbnail || "";

      return {
        cart_id: row.cart_id,
        cartItemId: String(row.cart_id),
        product_id: row.product_id,
        variant_id: row.variant_id,
        qty: Number(row.qty || 1),
        quantity: Number(row.qty || 1),
        selected_size: selectedSize,
        selected_color: selectedColor,
        size: selectedSize,
        color: selectedColor,
        item_price: Number(row.item_price || price || 0),
        price,
        name: itemData.name || row.name,
        slug: itemData.slug || row.slug,
        thumbnail: row.thumbnail,
        image,
        fabric: row.variant_fabric || itemData.fabric || "",
        material: itemData.material || "",
        brand: itemData.brand || "",
        stock: Number(row.stock || 0),
        sizes: parseSizes(itemData, row),
        colors: Array.isArray(itemData.colors) ? itemData.colors : [],
        item_data: itemData,
      };
    });

    return successResponse(res, cart, "Cart fetched successfully");
  } catch (error) {
    console.error("Get cart error:", error);
    return errorResponse(res, error.message || "Failed to fetch cart", 500);
  }
};

const addToCart = async (req, res) => {
  try {
    const ctx = requireCartScope(req, res);
    if (!ctx) return;

    const { scope, where } = ctx;
    const { storeId, customerId, sessionId } = scope;

    const {
      product_id,
      variant_id = null,
      quantity = 1,
      selected_size = null,
      selected_color = null,
      item_price = 0,
      item_data = null,
    } = req.body;

    if (!product_id) {
      return errorResponse(res, "Product id required", 400);
    }

    const productRows = await query(
      `SELECT id, price, offer_price, stock 
       FROM products 
       WHERE id = ? AND store_id = ? AND status = 'active'`,
      [product_id, storeId]
    );

    if (!productRows.length) {
      return errorResponse(res, "Product not found", 404);
    }

    const product = productRows[0];
    const finalPrice = Number(
      item_price || product.offer_price || product.price || 0
    );

    const qty = Math.max(1, Number(quantity) || 1);

    const jsonData =
      item_data && typeof item_data === "object"
        ? JSON.stringify(item_data)
        : item_data
        ? item_data
        : null;

    const existing = await query(
      `SELECT id, quantity 
       FROM cart
       WHERE ${where.clause}
         AND product_id = ?
         AND COALESCE(variant_id, 0) = COALESCE(?, 0)
         AND COALESCE(selected_size, '') = COALESCE(?, '')
         AND COALESCE(selected_color, '') = COALESCE(?, '')
       LIMIT 1`,
      [
        ...where.params,
        product_id,
        variant_id || null,
        selected_size || null,
        selected_color || null,
      ]
    );

    if (existing.length) {
      await query(
        `UPDATE cart 
         SET quantity = quantity + ?,
             item_price = ?,
             item_data = COALESCE(?, item_data),
             updated_at = NOW()
         WHERE id = ? AND store_id = ?`,
        [qty, finalPrice, jsonData, existing[0].id, storeId]
      );
    } else {
      await query(
        `INSERT INTO cart
          (store_id, customer_id, session_id, product_id, variant_id, quantity, selected_size, selected_color, item_price, item_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          storeId,
          customerId || null,
          customerId ? null : sessionId,
          product_id,
          variant_id || null,
          qty,
          selected_size || null,
          selected_color || null,
          finalPrice,
          jsonData,
        ]
      );
    }

    return successResponse(res, null, "Added to cart");
  } catch (error) {
    console.error("Add cart error:", error);
    return errorResponse(res, error.message || "Failed to add cart", 500);
  }
};

// 

const updateCartItem = async (req, res) => {
  try {
    const ctx = requireCartScope(req, res);
    if (!ctx) return;

    const { where, scope } = ctx;
    const { storeId } = scope;
    const cartId = req.params.id;

    if (!cartId) {
      return errorResponse(res, "Cart item id required", 400);
    }

    const { quantity, selected_size, selected_color, variant_id, item_price } = req.body;

    let finalVariantId = variant_id;
    let finalItemPrice = item_price;
    let finalSelectedColor = selected_color;

    if (selected_size !== undefined) {
      const cartRows = await query(
        `SELECT product_id, selected_color
         FROM cart
         WHERE id = ? AND ${where.clause}
         LIMIT 1`,
        [cartId, ...where.params]
      );

      if (cartRows.length) {
        const productId = cartRows[0].product_id;
        const colorToUse = selected_color || cartRows[0].selected_color || "";

        const variantRows = await query(
          `SELECT id, color, size, price, offer_price
           FROM product_variants
           WHERE product_id = ?
             AND store_id = ?
             AND size = ?
             AND (? = '' OR color = ?)
           LIMIT 1`,
          [productId, storeId, selected_size, colorToUse, colorToUse]
        );

        if (variantRows.length) {
          const v = variantRows[0];
          finalVariantId = v.id;
          finalSelectedColor = v.color || colorToUse;
          finalItemPrice = Number(v.offer_price || v.price || 0);
        }
      }
    }

    const fields = [];
    const values = [];

    if (quantity !== undefined) {
      fields.push("quantity = ?");
      values.push(Math.max(1, Number(quantity) || 1));
    }

    if (selected_size !== undefined) {
      fields.push("selected_size = ?");
      values.push(selected_size || null);
    }

    if (finalSelectedColor !== undefined) {
      fields.push("selected_color = ?");
      values.push(finalSelectedColor || null);
    }

    if (finalVariantId !== undefined) {
      fields.push("variant_id = ?");
      values.push(finalVariantId || null);
    }

    if (finalItemPrice !== undefined) {
      fields.push("item_price = ?");
      values.push(Number(finalItemPrice) || 0);
    }

    if (!fields.length) {
      return errorResponse(res, "Nothing to update", 400);
    }

    fields.push("updated_at = NOW()");

    const result = await query(
      `UPDATE cart
       SET ${fields.join(", ")}
       WHERE id = ? AND ${where.clause}`,
      [...values, cartId, ...where.params]
    );

    if (result?.affectedRows === 0) {
      return errorResponse(res, "Cart item not found", 404);
    }

    return successResponse(res, null, "Cart updated");
  } catch (error) {
    console.error("Update cart error:", error);
    return errorResponse(res, error.message || "Failed to update cart", 500);
  }
};

const removeCartItem = async (req, res) => {
  try {
    const ctx = requireCartScope(req, res);
    if (!ctx) return;

    const { where } = ctx;
    const cartId = req.params.id;

    if (!cartId) {
      return errorResponse(res, "Cart item id required", 400);
    }

    const result = await query(
      `DELETE FROM cart WHERE id = ? AND ${where.clause}`,
      [cartId, ...where.params]
    );

    if (result?.affectedRows === 0) {
      return errorResponse(res, "Cart item not found", 404);
    }

    return successResponse(res, null, "Cart item removed");
  } catch (error) {
    console.error("Remove cart error:", error);
    return errorResponse(res, error.message || "Failed to remove cart item", 500);
  }
};

const clearCart = async (req, res) => {
  try {
    const ctx = requireCartScope(req, res);
    if (!ctx) return;

    const { where } = ctx;

    await query(`DELETE FROM cart WHERE ${where.clause}`, where.params);

    return successResponse(res, null, "Cart cleared");
  } catch (error) {
    console.error("Clear cart error:", error);
    return errorResponse(res, error.message || "Failed to clear cart", 500);
  }
};

module.exports.getCart = getCart;
module.exports.addToCart = addToCart;
module.exports.updateCartItem = updateCartItem;
module.exports.removeCartItem = removeCartItem;
module.exports.clearCart = clearCart;
