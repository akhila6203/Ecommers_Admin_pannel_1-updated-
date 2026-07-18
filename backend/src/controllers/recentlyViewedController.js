const { query } = require("../config/db");
const logger = require("../config/logger");

/**
 * Store ID is expected from storeMiddleware.
 * Based on your project it may be available as:
 * req.store.id / req.storeId / req.store_id
 */
const getStoreId = (req) => {
  return Number(
    req.store?.id ||
      req.storeId ||
      req.store_id ||
      req.headers["x-store-id"]
  );
};

/**
 * Supports common customer middleware formats.
 */
const getCustomerId = (req) => {
  const value =
    req.customer?.id ||
    req.customer?.customer_id ||
    req.user?.id ||
    req.user?.customer_id ||
    null;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
};

const getSessionId = (req) => {
  const value =
    req.headers["x-cart-session-id"] ||
    req.headers["x-session-id"] ||
    null;

  if (!value) return null;

  return String(value).trim().slice(0, 191);
};

const parseLimit = (value) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 8;
  }

  return Math.min(Math.max(parsed, 1), 20);
};

/**
 * POST /api/storefront/recently-viewed
 *
 * Body:
 * {
 *   product_id: 12
 * }
 */
const recordRecentlyViewed = async (req, res, next) => {
  try {
    const storeId = getStoreId(req);
    const customerId = getCustomerId(req);
    const sessionId = getSessionId(req);
    const productId = Number(req.body?.product_id);

    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid store ID is required",
      });
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    /*
     * Guest customer ki session ID mandatory.
     * Logged-in customer ki customer ID saripothundi.
     */
    if (!customerId && !sessionId) {
      return res.status(400).json({
        success: false,
        message:
          "Customer login or X-Cart-Session-Id is required",
      });
    }

    const productRows = await query(
      `
        SELECT id
        FROM products
        WHERE id = ?
          AND store_id = ?
          AND status = 'active'
        LIMIT 1
      `,
      [productId, storeId]
    );

    if (!productRows.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (customerId) {
      /*
       * Login ayina user same product malli chusthe:
       * duplicate row create cheyyakunda viewed_at update chestham.
       */
      await query(
        `
          INSERT INTO recently_viewed_products (
            store_id,
            customer_id,
            session_id,
            product_id,
            viewed_at
          )
          VALUES (?, ?, NULL, ?, NOW())

          ON DUPLICATE KEY UPDATE
            viewed_at = NOW(),
            updated_at = NOW()
        `,
        [storeId, customerId, productId]
      );

      /*
       * Login ayina taruvatha guest session history ni
       * customer history tho merge cheyyadam.
       */
      if (sessionId) {
        await query(
  `
    INSERT INTO recently_viewed_products (
      store_id,
      customer_id,
      session_id,
      product_id,
      viewed_at
    )
    SELECT
      store_id,
      ?,
      NULL,
      product_id,
      viewed_at
    FROM recently_viewed_products
    WHERE store_id = ?
      AND session_id = ?

    ON DUPLICATE KEY UPDATE
      viewed_at = NOW(),
      updated_at = NOW()
  `,
  [customerId, storeId, sessionId]
);

        await query(
          `
            DELETE FROM recently_viewed_products
            WHERE store_id = ?
              AND session_id = ?
          `,
          [storeId, sessionId]
        );
      }
    } else {
      await query(
        `
          INSERT INTO recently_viewed_products (
            store_id,
            customer_id,
            session_id,
            product_id,
            viewed_at
          )
          VALUES (?, NULL, ?, ?, NOW())

          ON DUPLICATE KEY UPDATE
            viewed_at = NOW(),
            updated_at = NOW()
        `,
        [storeId, sessionId, productId]
      );
    }

    /*
     * Per user/session maximum 30 records maintain chestham.
     */
    if (customerId) {
      await query(
        `
          DELETE FROM recently_viewed_products
          WHERE store_id = ?
            AND customer_id = ?
            AND id NOT IN (
              SELECT id
              FROM (
                SELECT id
                FROM recently_viewed_products
                WHERE store_id = ?
                  AND customer_id = ?
                ORDER BY viewed_at DESC, id DESC
                LIMIT 30
              ) AS recent_rows
            )
        `,
        [
          storeId,
          customerId,
          storeId,
          customerId,
        ]
      );
    } else {
      await query(
        `
          DELETE FROM recently_viewed_products
          WHERE store_id = ?
            AND session_id = ?
            AND id NOT IN (
              SELECT id
              FROM (
                SELECT id
                FROM recently_viewed_products
                WHERE store_id = ?
                  AND session_id = ?
                ORDER BY viewed_at DESC, id DESC
                LIMIT 30
              ) AS recent_rows
            )
        `,
        [
          storeId,
          sessionId,
          storeId,
          sessionId,
        ]
      );
    }

    return res.status(200).json({
      success: true,
      message: "Recently viewed product recorded",
    });
  } catch (error) {
    logger.error("Record recently viewed error", {
      error: error.message,
      stack: error.stack,
    });

    next(error);
  }
};

/**
 * GET /api/storefront/recently-viewed?limit=8&exclude_product_id=12
 */
const getRecentlyViewed = async (req, res, next) => {
  try {
    const storeId = getStoreId(req);
    const customerId = getCustomerId(req);
    const sessionId = getSessionId(req);

    const limit = parseLimit(req.query.limit);

    const excludeProductId = Number(
      req.query.exclude_product_id
    );

    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid store ID is required",
      });
    }

    if (!customerId && !sessionId) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const ownerCondition = customerId
      ? "rv.customer_id = ?"
      : "rv.session_id = ?";

    const ownerValue = customerId
      ? customerId
      : sessionId;

    const excludeCondition =
      Number.isInteger(excludeProductId) &&
      excludeProductId > 0
        ? "AND p.id <> ?"
        : "";

    const params = [
      storeId,
      ownerValue,
    ];

    if (excludeCondition) {
      params.push(excludeProductId);
    }

    /*
     * LIMIT parameter ni SQL placeholder ga use cheyyakunda,
     * already validated integer ni direct interpolate chesthunnam.
     */
    const rows = await query(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          p.price,
          p.offer_price,
          p.thumbnail,
          p.brand,
          p.fabric,
          p.material,
          p.product_type,
          p.sale_mode,
          p.category_id,
          p.sub_category_id,
          p.child_category_id,

          c.name AS category_name,
          sc.name AS sub_category_name,
          cc.name AS child_category_name,

          rv.viewed_at

        FROM recently_viewed_products rv

        INNER JOIN products p
          ON p.id = rv.product_id
         AND p.store_id = rv.store_id

        LEFT JOIN categories c
          ON c.id = p.category_id

        LEFT JOIN categories sc
          ON sc.id = p.sub_category_id

        LEFT JOIN categories cc
          ON cc.id = p.child_category_id

        WHERE rv.store_id = ?
          AND ${ownerCondition}
          AND p.status = 'active'
          ${excludeCondition}

        ORDER BY
          rv.viewed_at DESC,
          rv.id DESC

        LIMIT ${limit}
      `,
      params
    );

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    logger.error("Get recently viewed error", {
      error: error.message,
      stack: error.stack,
    });

    next(error);
  }
};

/**
 * DELETE /api/storefront/recently-viewed
 */
const clearRecentlyViewed = async (req, res, next) => {
  try {
    const storeId = getStoreId(req);
    const customerId = getCustomerId(req);
    const sessionId = getSessionId(req);

    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid store ID is required",
      });
    }

    if (!customerId && !sessionId) {
      return res.status(200).json({
        success: true,
        message: "Recently viewed products cleared",
      });
    }

    if (customerId) {
      await query(
        `
          DELETE FROM recently_viewed_products
          WHERE store_id = ?
            AND customer_id = ?
        `,
        [storeId, customerId]
      );
    } else {
      await query(
        `
          DELETE FROM recently_viewed_products
          WHERE store_id = ?
            AND session_id = ?
        `,
        [storeId, sessionId]
      );
    }

    return res.status(200).json({
      success: true,
      message: "Recently viewed products cleared",
    });
  } catch (error) {
    logger.error("Clear recently viewed error", {
      error: error.message,
      stack: error.stack,
    });

    next(error);
  }
};

module.exports = {
  recordRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewed,
};