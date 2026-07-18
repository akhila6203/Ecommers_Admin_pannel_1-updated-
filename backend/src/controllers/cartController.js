const { query } = require("../config/db");

const {
  successResponse,
  errorResponse,
} = require("../helpers/responseHelper");

const {
  resolveCartScope,
  cartWhereClause,
} = require("../helpers/cartHelper");

/* =========================================================
   COMMON HELPERS
========================================================= */

const safeJsonParse = (
  value,
  fallback = {}
) => {
  try {
    if (!value) return fallback;

    if (
      typeof value === "object"
    ) {
      return value;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const roundQuantity = (
  value
) =>
  Math.round(
    (
      Number(value || 0) +
      Number.EPSILON
    ) * 100
  ) / 100;

const normalizeSaleMode = (
  value
) => {
  const mode = String(
    value || "piece"
  )
    .trim()
    .toLowerCase();

  return [
    "piece",
    "size",
    "meter",
  ].includes(mode)
    ? mode
    : "piece";
};

const parseSizes = (
  itemData,
  row
) => {
  const sizesFromItemData =
    Array.isArray(
      itemData?.sizes
    )
      ? itemData.sizes
          .map((value) =>
            String(
              value || ""
            ).trim()
          )
          .filter(Boolean)
      : [];

  if (
    sizesFromItemData.length
  ) {
    return [
      ...new Set(
        sizesFromItemData
      ),
    ];
  }

  const variantSize =
    String(
      row.variant_size || ""
    ).trim();

  return variantSize
    ? [variantSize]
    : [];
};

const requireCartScope = (
  req,
  res
) => {
  const scope =
    resolveCartScope(req);

  const where =
    cartWhereClause(scope);

  if (!where) {
    errorResponse(
      res,
      "Cart session id or login required",
      400
    );

    return null;
  }

  return {
    scope,
    where,
  };
};

const isStepAligned = (
  quantity,
  minimum,
  step
) => {
  if (
    quantity < minimum ||
    step <= 0
  ) {
    return false;
  }

  const stepCount =
    (quantity - minimum) /
    step;

  return (
    Math.abs(
      stepCount -
        Math.round(stepCount)
    ) < 0.000001
  );
};

const normalizeRequestedQuantity = ({
  quantity,
  saleMode,
  minimumQuantity,
  quantityStep,
}) => {
  const requestedQuantity =
    Number(quantity);

  const minimum =
    Number(
      minimumQuantity || 1
    );

  const step =
    Number(
      quantityStep || 1
    );

  if (
    !Number.isFinite(
      requestedQuantity
    ) ||
    requestedQuantity <= 0
  ) {
    throw new Error(
      "Invalid quantity"
    );
  }

  /*
   * Meter products:
   * Decimal quantity allowed.
   */
  if (
    saleMode === "meter"
  ) {
    if (
      !Number.isFinite(minimum) ||
      !Number.isFinite(step) ||
      minimum <= 0 ||
      step <= 0
    ) {
      throw new Error(
        "Invalid meter quantity configuration"
      );
    }

    if (
      !isStepAligned(
        requestedQuantity,
        minimum,
        step
      )
    ) {
      throw new Error(
        `Quantity must start from ${minimum} meter and increase by ${step} meter`
      );
    }

    return roundQuantity(
      requestedQuantity
    );
  }

  /*
   * Piece and size products:
   * Whole number quantity only.
   */
  if (
    !Number.isInteger(
      requestedQuantity
    )
  ) {
    throw new Error(
      "Quantity must be a whole number"
    );
  }

  return Math.max(
    1,
    requestedQuantity
  );
};

const getErrorStatusCode = (
  error
) => {
  const message = String(
    error?.message || ""
  );

  const validationMessages = [
    "Invalid quantity",
    "Invalid meter quantity configuration",
    "Quantity must",
  ];

  const isValidationError =
    validationMessages.some(
      (text) =>
        message.includes(text)
    );

  return isValidationError
    ? 400
    : 500;
};

/* =========================================================
   GET CART
========================================================= */

const getCart = async (
  req,
  res
) => {
  try {
    const ctx =
  requireCartScope(
    req,
    res
  );

if (!ctx) return;

const { scope } = ctx;

    const where =
      cartWhereClause(
        scope,
        "c"
      );

      if (!where) {
  return errorResponse(
    res,
    "Cart session id or login required",
    400
  );
}

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
         p.stock AS product_stock,
         p.gst_percent,

         p.sale_mode,
         p.unit_name,
         p.minimum_quantity,
         p.quantity_step,

         pv.fabric AS variant_fabric,
         pv.color AS variant_color,
         pv.size AS variant_size,
         pv.stock AS variant_stock,
         pv.price AS variant_price,
         pv.offer_price AS variant_offer_price

       FROM cart c

       INNER JOIN products p
         ON p.id = c.product_id
        AND p.store_id = c.store_id

       LEFT JOIN product_variants pv
         ON pv.id = c.variant_id
        AND pv.product_id = c.product_id
        AND pv.store_id = c.store_id

       WHERE ${where.clause}

       ORDER BY c.updated_at DESC`,
      where.params
    );

    const cart = rows.map(
      (row) => {
        const itemData =
          safeJsonParse(
            row.item_data,
            {}
          );

        const selectedSize =
          String(
            row.selected_size ||
              itemData.selected_size ||
              row.variant_size ||
              ""
          ).trim();

        const selectedColor =
          String(
            row.selected_color ||
              itemData.selected_color ||
              row.variant_color ||
              ""
          ).trim();

        const saleMode =
          normalizeSaleMode(
            row.sale_mode ||
              itemData.sale_mode
          );

        const isMeter =
          saleMode === "meter";

        const unitName =
          row.unit_name ||
          itemData.unit_name ||
          (
            isMeter
              ? "meter"
              : "piece"
          );

        const minimumQuantity =
          isMeter
            ? Number(
                row.minimum_quantity ||
                  itemData.minimum_quantity ||
                  1
              )
            : 1;

        const quantityStep =
          isMeter
            ? Number(
                row.quantity_step ||
                  itemData.quantity_step ||
                  0.5
              )
            : 1;

        const price =
          Number(
            row.item_price ||
              row.variant_offer_price ||
              row.variant_price ||
              row.offer_price ||
              row.price ||
              0
          );

        const availableStock =
          row.variant_id
            ? Number(
                row.variant_stock ||
                  0
              )
            : Number(
                row.product_stock ||
                  0
              );

        const image =
          itemData.image ||
          row.thumbnail ||
          "";

        return {
          cart_id:
            row.cart_id,

          cartItemId:
            String(
              row.cart_id
            ),

          product_id:
            row.product_id,

          variant_id:
            row.variant_id ||
            null,

          qty:
            Number(
              row.qty || 1
            ),

          quantity:
            Number(
              row.qty || 1
            ),

          selected_size:
            selectedSize,

          selected_color:
            selectedColor,

          size:
            selectedSize,

          color:
            selectedColor,

          item_price:
            price,

          price,

          name:
            itemData.name ||
            row.name,

          slug:
            itemData.slug ||
            row.slug,

          thumbnail:
            row.thumbnail,

          image,

          fabric:
            row.variant_fabric ||
            itemData.fabric ||
            "",

          material:
            itemData.material ||
            "",

          brand:
            itemData.brand ||
            "",

          stock:
            availableStock,

          gst_percent:
            Number(
              row.gst_percent ||
                itemData.gst_percent ||
                0
            ),

          sale_mode:
            saleMode,

          unit_name:
            unitName,

          minimum_quantity:
            minimumQuantity,

          quantity_step:
            quantityStep,

          sizes:
            parseSizes(
              itemData,
              row
            ),

          colors:
            Array.isArray(
              itemData.colors
            )
              ? itemData.colors
              : [],

          variants:
            Array.isArray(
              itemData.variants
            )
              ? itemData.variants
              : [],

          item_data:
            itemData,
        };
      }
    );

    return successResponse(
      res,
      cart,
      "Cart fetched successfully"
    );
  } catch (error) {
    console.error(
      "Get cart error:",
      error
    );

    return errorResponse(
      res,
      error.message ||
        "Failed to fetch cart",
      500
    );
  }
};

/* =========================================================
   ADD TO CART
========================================================= */

const addToCart = async (
  req,
  res
) => {
  try {
    const ctx =
      requireCartScope(
        req,
        res
      );

    if (!ctx) return;

    const {
      scope,
      where,
    } = ctx;

    const {
      storeId,
      customerId,
      sessionId,
    } = scope;

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
      return errorResponse(
        res,
        "Product id required",
        400
      );
    }

    /*
     * Product details must always
     * come from the database.
     */
    const productRows =
      await query(
        `SELECT
           id,
           price,
           offer_price,
           stock,
           sale_mode,
           unit_name,
           minimum_quantity,
           quantity_step

         FROM products

         WHERE id = ?
           AND store_id = ?
           AND status = 'active'

         LIMIT 1`,
        [
          product_id,
          storeId,
        ]
      );

    if (
      !productRows.length
    ) {
      return errorResponse(
        res,
        "Product not found",
        404
      );
    }

    const product =
      productRows[0];

    const saleMode =
      normalizeSaleMode(
        product.sale_mode
      );

    const minimumQuantity =
      saleMode === "meter"
        ? Number(
            product.minimum_quantity ||
              1
          )
        : 1;

    const quantityStep =
      saleMode === "meter"
        ? Number(
            product.quantity_step ||
              0.5
          )
        : 1;

    const requestedQuantity =
      normalizeRequestedQuantity({
        quantity,
        saleMode,
        minimumQuantity,
        quantityStep,
      });

    /*
     * Check whether same product,
     * variant, size and color already
     * exists in cart.
     */
    const existingRows =
      await query(
        `SELECT
           id,
           quantity

         FROM cart

         WHERE ${where.clause}
           AND product_id = ?
           AND COALESCE(
                 variant_id,
                 0
               ) =
               COALESCE(?, 0)
           AND COALESCE(
                 selected_size,
                 ''
               ) =
               COALESCE(?, '')
           AND COALESCE(
                 selected_color,
                 ''
               ) =
               COALESCE(?, '')

         LIMIT 1`,
        [
          ...where.params,
          product_id,
          variant_id || null,
          selected_size || null,
          selected_color || null,
        ]
      );

    const existingQuantity =
      existingRows.length
        ? Number(
            existingRows[0]
              .quantity || 0
          )
        : 0;

    const finalRequestedQuantity =
      roundQuantity(
        existingQuantity +
          requestedQuantity
      );

    /*
     * Default stock is product stock.
     */
    let availableStock =
      Number(
        product.stock || 0
      );

    let variantPrice = 0;

    /*
     * Variant selected:
     * use variant stock and price.
     */
    if (variant_id) {
      const variantRows =
        await query(
          `SELECT
             id,
             stock,
             price,
             offer_price,
             size,
             color

           FROM product_variants

           WHERE id = ?
             AND product_id = ?
             AND store_id = ?
             AND status = 'active'

           LIMIT 1`,
          [
            variant_id,
            product_id,
            storeId,
          ]
        );

      if (
        !variantRows.length
      ) {
        return errorResponse(
          res,
          "Selected product variant is unavailable",
          400
        );
      }

      const variant =
        variantRows[0];

      availableStock =
        Number(
          variant.stock || 0
        );

      variantPrice =
        Number(
          variant.offer_price ||
            variant.price ||
            0
        );
    }

    if (
      finalRequestedQuantity >
      availableStock
    ) {
      return errorResponse(
        res,
        saleMode === "meter"
          ? "Requested fabric length is not available"
          : "Requested quantity is not available",
        400
      );
    }

    const finalPrice =
      Number(
        item_price ||
          variantPrice ||
          product.offer_price ||
          product.price ||
          0
      );

    const jsonData =
      item_data &&
      typeof item_data ===
        "object"
        ? JSON.stringify(
            item_data
          )
        : item_data || null;

    /*
     * Same cart combination exists:
     * update quantity.
     */
    if (
      existingRows.length
    ) {
      await query(
        `UPDATE cart

         SET quantity = ?,
             variant_id = ?,
             selected_size = ?,
             selected_color = ?,
             item_price = ?,
             item_data =
               COALESCE(
                 ?,
                 item_data
               ),
             updated_at = NOW()

         WHERE id = ?
           AND store_id = ?`,
        [
          finalRequestedQuantity,
          variant_id || null,
          selected_size || null,
          selected_color || null,
          finalPrice,
          jsonData,
          existingRows[0].id,
          storeId,
        ]
      );

      return successResponse(
        res,
        {
          cart_id:
            existingRows[0].id,

          quantity:
            finalRequestedQuantity,
        },
        "Cart updated successfully"
      );
    }

    /*
     * New cart item.
     */
    const result =
      await query(
        `INSERT INTO cart (
           store_id,
           customer_id,
           session_id,
           product_id,
           variant_id,
           quantity,
           selected_size,
           selected_color,
           item_price,
           item_data
         )
         VALUES (
           ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?
         )`,
        [
          storeId,
          customerId || null,
          customerId
            ? null
            : sessionId,
          product_id,
          variant_id || null,
          requestedQuantity,
          selected_size || null,
          selected_color || null,
          finalPrice,
          jsonData,
        ]
      );

    return successResponse(
      res,
      {
        cart_id:
          result.insertId,

        quantity:
          requestedQuantity,
      },
      "Added to cart successfully"
    );
  } catch (error) {
    console.error(
      "Add cart error:",
      error
    );

    return errorResponse(
      res,
      error.message ||
        "Failed to add cart",
      getErrorStatusCode(
        error
      )
    );
  }
};

/* =========================================================
   UPDATE CART ITEM
   Quantity / Size / Color / Variant
========================================================= */
const updateCartItem = async (
  req,
  res
) => {
  try {
    const ctx =
      requireCartScope(
        req,
        res
      );

    if (!ctx) return;

    const { scope } = ctx;
    const { storeId } = scope;

    const selectWhere =
      cartWhereClause(
        scope,
        "c"
      );

 
    const updateWhere =
      cartWhereClause(
        scope
      );

    if (
      !selectWhere ||
      !updateWhere
    ) {
      return errorResponse(
        res,
        "Cart session id or login required",
        400
      );
    }

    const cartId =
      req.params.id;

    if (!cartId) {
      return errorResponse(
        res,
        "Cart item id required",
        400
      );
    }

    const {
      quantity,
      selected_size,
      selected_color,
      variant_id,
      item_price,
    } = req.body;

    const cartRows =
      await query(
        `SELECT
           c.id,
           c.product_id,
           c.variant_id,
           c.quantity,
           c.selected_size,
           c.selected_color,
           c.item_price,

           p.sale_mode,
           p.unit_name,
           p.minimum_quantity,
           p.quantity_step,
           p.stock AS product_stock,
           p.price AS product_price,
           p.offer_price AS product_offer_price

         FROM cart c

         INNER JOIN products p
           ON p.id = c.product_id
          AND p.store_id = c.store_id

         WHERE c.id = ?
           AND ${selectWhere.clause}

         LIMIT 1`,
        [
          cartId,
          ...selectWhere.params,
        ]
      );

    if (!cartRows.length) {
      return errorResponse(
        res,
        "Cart item not found",
        404
      );
    }

    const cartItem =
      cartRows[0];

    const productId =
      cartItem.product_id;

    const saleMode =
      normalizeSaleMode(
        cartItem.sale_mode
      );

    const minimumQuantity =
      saleMode === "meter"
        ? Number(
            cartItem.minimum_quantity ||
              1
          )
        : 1;

    const quantityStep =
      saleMode === "meter"
        ? Number(
            cartItem.quantity_step ||
              0.5
          )
        : 1;

    let finalVariantId =
      variant_id !== undefined
        ? variant_id || null
        : cartItem.variant_id;

    let finalSelectedSize =
      selected_size !== undefined
        ? selected_size || null
        : cartItem.selected_size;

    let finalSelectedColor =
      selected_color !== undefined
        ? selected_color || null
        : cartItem.selected_color;

    let finalItemPrice =
      item_price !== undefined
        ? Number(
            item_price || 0
          )
        : Number(
            cartItem.item_price ||
              cartItem.product_offer_price ||
              cartItem.product_price ||
              0
          );

    let availableStock =
      Number(
        cartItem.product_stock ||
          0
      );

    if (
      selected_size !== undefined
    ) {
      const colorToUse =
        selected_color !==
        undefined
          ? selected_color || ""
          : cartItem
              .selected_color ||
            "";

      const variantRows =
        await query(
          `SELECT
             id,
             size,
             color,
             stock,
             price,
             offer_price

           FROM product_variants

           WHERE product_id = ?
             AND store_id = ?
             AND size = ?
             AND status = 'active'
             AND (
               ? = ''
               OR color = ?
             )

           LIMIT 1`,
          [
            productId,
            storeId,
            selected_size,
            colorToUse,
            colorToUse,
          ]
        );

      if (
        !variantRows.length
      ) {
        return errorResponse(
          res,
          "Selected size is unavailable",
          400
        );
      }

      const matchedVariant =
        variantRows[0];

      finalVariantId =
        matchedVariant.id;

      finalSelectedSize =
        matchedVariant.size ||
        selected_size;

      finalSelectedColor =
        matchedVariant.color ||
        colorToUse ||
        null;

      finalItemPrice =
        Number(
          matchedVariant.offer_price ||
            matchedVariant.price ||
            finalItemPrice ||
            0
        );

      availableStock =
        Number(
          matchedVariant.stock ||
            0
        );
    } else if (
      finalVariantId
    ) {
 
      const variantRows =
        await query(
          `SELECT
             id,
             size,
             color,
             stock,
             price,
             offer_price

           FROM product_variants

           WHERE id = ?
             AND product_id = ?
             AND store_id = ?
             AND status = 'active'

           LIMIT 1`,
          [
            finalVariantId,
            productId,
            storeId,
          ]
        );

      if (
        !variantRows.length
      ) {
        return errorResponse(
          res,
          "Selected product variant is unavailable",
          400
        );
      }

      const matchedVariant =
        variantRows[0];

      availableStock =
        Number(
          matchedVariant.stock ||
            0
        );

      if (
        item_price === undefined
      ) {
        finalItemPrice =
          Number(
            matchedVariant.offer_price ||
              matchedVariant.price ||
              finalItemPrice ||
              0
          );
      }
    }

    let finalQuantity =
      Number(
        cartItem.quantity ||
          1
      );

    if (
      quantity !== undefined
    ) {
      finalQuantity =
        normalizeRequestedQuantity({
          quantity,
          saleMode,
          minimumQuantity,
          quantityStep,
        });
    }

    if (
      finalQuantity >
      availableStock
    ) {
      return errorResponse(
        res,
        saleMode === "meter"
          ? "Requested fabric length is not available"
          : "Requested quantity is not available",
        400
      );
    }

    const fields = [];
    const values = [];

    if (
      quantity !== undefined
    ) {
      fields.push(
        "quantity = ?"
      );

      values.push(
        finalQuantity
      );
    }

    if (
      selected_size !== undefined
    ) {
      fields.push(
        "selected_size = ?"
      );

      values.push(
        finalSelectedSize
      );
    }

    if (
      selected_color !== undefined ||
      selected_size !== undefined
    ) {
      fields.push(
        "selected_color = ?"
      );

      values.push(
        finalSelectedColor
      );
    }

    if (
      variant_id !== undefined ||
      selected_size !== undefined
    ) {
      fields.push(
        "variant_id = ?"
      );

      values.push(
        finalVariantId
      );
    }

    if (
      item_price !== undefined ||
      selected_size !== undefined
    ) {
      fields.push(
        "item_price = ?"
      );

      values.push(
        Number(
          finalItemPrice ||
            0
        )
      );
    }

    if (!fields.length) {
      return errorResponse(
        res,
        "Nothing to update",
        400
      );
    }

    fields.push(
      "updated_at = NOW()"
    );

    const result =
      await query(
        `UPDATE cart
         SET ${fields.join(", ")}
         WHERE id = ?
           AND ${updateWhere.clause}`,
        [
          ...values,
          cartId,
          ...updateWhere.params,
        ]
      );

    if (
      result?.affectedRows === 0
    ) {
      return errorResponse(
        res,
        "Cart item not found",
        404
      );
    }

    return successResponse(
      res,
      {
        cart_id:
          Number(cartId),

        quantity:
          finalQuantity,

        variant_id:
          finalVariantId ||
          null,

        selected_size:
          finalSelectedSize ||
          "",

        selected_color:
          finalSelectedColor ||
          "",

        item_price:
          Number(
            finalItemPrice ||
              0
          ),
      },
      "Cart updated successfully"
    );
  } catch (error) {
    console.error(
      "Update cart error:",
      error
    );

    return errorResponse(
      res,
      error.message ||
        "Failed to update cart",
      getErrorStatusCode(
        error
      )
    );
  }
};

/* =========================================================
   REMOVE ONE CART ITEM
========================================================= */

const removeCartItem = async (
  req,
  res
) => {
  try {
    const ctx =
      requireCartScope(
        req,
        res
      );

    if (!ctx) return;

    const { where } = ctx;

    const cartId =
      req.params.id;

    if (!cartId) {
      return errorResponse(
        res,
        "Cart item id required",
        400
      );
    }

    const result =
      await query(
        `DELETE FROM cart
         WHERE id = ?
           AND ${where.clause}`,
        [
          cartId,
          ...where.params,
        ]
      );

    if (
      result?.affectedRows === 0
    ) {
      return errorResponse(
        res,
        "Cart item not found",
        404
      );
    }

    return successResponse(
      res,
      null,
      "Cart item removed"
    );
  } catch (error) {
    console.error(
      "Remove cart error:",
      error
    );

    return errorResponse(
      res,
      error.message ||
        "Failed to remove cart item",
      500
    );
  }
};

/* =========================================================
   CLEAR COMPLETE CART
========================================================= */

const clearCart = async (
  req,
  res
) => {
  try {
    const ctx =
      requireCartScope(
        req,
        res
      );

    if (!ctx) return;

    const { where } = ctx;

    await query(
      `DELETE FROM cart
       WHERE ${where.clause}`,
      where.params
    );

    return successResponse(
      res,
      null,
      "Cart cleared"
    );
  } catch (error) {
    console.error(
      "Clear cart error:",
      error
    );

    return errorResponse(
      res,
      error.message ||
        "Failed to clear cart",
      500
    );
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};


