const { query } = require("../config/db");
const { getStoreId } = require("./storeHelper");
const getSessionId = (req) =>
  req.headers["x-cart-session-id"] ||
  req.body?.session_id ||
  req.query?.session_id ||
  null;

const resolveCartScope = (req) => {
  const storeId = getStoreId(req);
  const customerId = req.customer?.id || null;
  const sessionId = getSessionId(req);
  return { storeId, customerId, sessionId };
};

const cartWhereClause = ({ storeId, customerId, sessionId }, alias = "cart") => {
  const col = (name) => `${alias}.${name}`;

  if (customerId) {
    return {
      clause: `${col("store_id")} = ? AND ${col("customer_id")} = ?`,
      params: [storeId, customerId],
    };
  }
  if (sessionId) {
    return {
      clause: `${col("store_id")} = ? AND ${col("session_id")} = ? AND (${col("customer_id")} IS NULL OR ${col("customer_id")} = 0)`,
      params: [storeId, sessionId],
    };
  }
  return null;
};

const mergeSessionCartToCustomer = async (storeId, sessionId, customerId) => {
  if (!sessionId || !customerId) return;

  const sessionItems = await query(
    `SELECT * FROM cart
     WHERE store_id = ? AND session_id = ? AND (customer_id IS NULL OR customer_id = 0)`,
    [storeId, sessionId]
  );

  for (const item of sessionItems) {
    const existing = await query(
      `SELECT id, quantity FROM cart
       WHERE store_id = ? AND customer_id = ? AND product_id = ?
         AND COALESCE(variant_id, 0) = COALESCE(?, 0)
         AND COALESCE(selected_size, '') = COALESCE(?, '')
         AND COALESCE(selected_color, '') = COALESCE(?, '')
       LIMIT 1`,
      [
        storeId,
        customerId,
        item.product_id,
        item.variant_id || null,
        item.selected_size || null,
        item.selected_color || null,
      ]
    );

    if (existing.length) {
      await query(
        `UPDATE cart SET quantity = quantity + ?, updated_at = NOW() WHERE id = ? AND store_id = ?`,
        [item.quantity, existing[0].id, storeId]
      );
      await query(`DELETE FROM cart WHERE id = ? AND store_id = ?`, [item.id, storeId]);
    } else {
      await query(
        `UPDATE cart SET customer_id = ?, session_id = NULL, updated_at = NOW()
         WHERE id = ? AND store_id = ?`,
        [customerId, item.id, storeId]
      );
    }
  }
};

module.exports.getSessionId = getSessionId;
module.exports.resolveCartScope = resolveCartScope;
module.exports.cartWhereClause = cartWhereClause;
module.exports.mergeSessionCartToCustomer = mergeSessionCartToCustomer;
