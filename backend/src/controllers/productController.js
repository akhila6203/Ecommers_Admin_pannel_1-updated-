const { query, getConnection } = require("../config/db");
const { generateSlug, generateUniqueSlug } = require("../helpers/slugHelper");
const { generateSKU, calculateDiscount } = require("../helpers/generateHelper");
const { successResponse, errorResponse, paginatedResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const parseJsonField = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseStockValue = (val) => {
  const n = Number.parseInt(String(val ?? "0").trim(), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
};

const parsePriceValue = (val, fallback = 0) => {
  const n = Number.parseFloat(String(val ?? fallback));
  return Number.isNaN(n) || n < 0 ? fallback : n;
};

const extractFabricsFromOptionValues = (optionValues) => {
  let options = optionValues;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(options)) return null;
  const fabric = options.find((o) => o.name?.toLowerCase() === "fabric");
  return fabric?.value || null;
};

const collectProductFabrics = (variants) => {
  const fabrics = new Set();
  for (const v of variants || []) {
    const fabric = extractFabricsFromOptionValues(v.option_values);
    if (fabric) fabrics.add(fabric);
  }
  return [...fabrics].join(", ");
};

const deriveProductStockFromVariants = (variantRows) =>
  (variantRows || []).reduce((sum, v) => sum + parseStockValue(v.stock), 0);

const deriveProductPricesFromVariants = (variantRows, fallbackPrice, fallbackOffer) => {
  if (!variantRows?.length) {
    return {
      price: parsePriceValue(fallbackPrice),
      offer_price: parsePriceValue(fallbackOffer),
    };
  }
  let selected = null;
  for (const v of variantRows) {
    const offer = parsePriceValue(v.offer_price ?? v.price, 0);
    const compare = parsePriceValue(v.price ?? offer, offer);
    if (!selected || offer < selected.offer_price) {
      selected = { price: compare, offer_price: offer };
    }
  }
  return (
    selected || {
      price: parsePriceValue(fallbackPrice),
      offer_price: parsePriceValue(fallbackOffer),
    }
  );
};

const resolveStockStatus = (stockQty, threshold = 5) => {
  if (stockQty <= 0) return "out_of_stock";
  if (stockQty <= threshold) return "low_stock";
  return "in_stock";
};

const syncProductInventory = async (conn, productId, stockQty, threshold = 5) => {
  await conn.execute(
    "UPDATE inventory SET quantity = ?, available_quantity = ? WHERE product_id = ?",
    [stockQty, stockQty, productId]
  );
  await conn.execute("UPDATE products SET stock = ?, stock_status = ? WHERE id = ?", [
    stockQty,
    resolveStockStatus(stockQty, threshold),
    productId,
  ]);
};

const parseCollectionIds = (value) => {
  if (value == null || value === "") return [];
  const raw = typeof value === "string" ? parseJsonField(value) ?? value : value;
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && id > 0);
};

const variantOptionsFromRow = (opts) => {
  let options = opts;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }
  if (!Array.isArray(options) || !options.length) return [];
  return options.map((o) => ({ name: o.name, value: o.value }));
};

const resolveVariantDimensions = (opts) => {
  const options = variantOptionsFromRow(opts);
  const size = options.find((o) => o.name?.toLowerCase() === "size")?.value || options[0]?.value || null;
  const color = options.find((o) => o.name?.toLowerCase() === "color")?.value || options[1]?.value || null;
  const fabric = options.find((o) => o.name?.toLowerCase() === "fabric")?.value || null;
  const optionValues = options.length ? JSON.stringify(options) : null;
  return { size, color, fabric, optionValues };
};

const variantComboKey = (opts) => {
  let options = opts;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }
  if (!Array.isArray(options)) return "";
  return options
    .map((o) => `${o.name}:${o.value}`)
    .sort()
    .join("|");
};

const getVariantColorKey = (opts, fallbackColor = null) => {
  const options = variantOptionsFromRow(opts);
  return options.find((o) => o.name?.toLowerCase() === "color")?.value || fallbackColor || null;
};

const attachColorVariantSummaries = async (products) => {
  const productIds = products.map((p) => p.id).filter(Boolean);
  if (!productIds.length) return;

  const placeholders = productIds.map(() => "?").join(",");
  const rows = await query(
    `SELECT pvi.product_id, pvi.image, pvi.sort_order, pv.option_values, pv.color
     FROM product_variant_images pvi
     INNER JOIN product_variants pv ON pv.id = pvi.variant_id
     WHERE pvi.product_id IN (${placeholders})
     ORDER BY pvi.product_id ASC, pvi.sort_order ASC, pvi.id ASC`,
    productIds
  );

  const colorMapByProduct = {};
  for (const row of rows) {
    const color = getVariantColorKey(row.option_values, row.color);
    if (!color) continue;
    if (!colorMapByProduct[row.product_id]) colorMapByProduct[row.product_id] = {};
    if (!colorMapByProduct[row.product_id][color]) {
      colorMapByProduct[row.product_id][color] = [];
    }
    const images = colorMapByProduct[row.product_id][color];
    if (!images.some((img) => img.image === row.image)) {
      images.push({ image: row.image, sort_order: row.sort_order || 0 });
    }
  }

  for (const product of products) {
    const colorMap = colorMapByProduct[product.id] || {};
    product.color_variants = Object.entries(colorMap).map(([color, images]) => ({
      color,
      image: images[0]?.image || null,
      image_count: images.length,
    }));
  }
};

const parseIdList = (value) => {
  if (value == null || value === "") return [];
  const raw = typeof value === "string" ? parseJsonField(value) ?? value : value;
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  return arr.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && id > 0);
};

const normalizeUploadedFiles = (files) => {
  if (!files) return [];
  return Array.isArray(files) ? files : [files];
};

const groupUploadedProductFiles = (req) => {
  const grouped = {
    thumbnail: [],
    gallery_images: [],
    variant_images: [],
    images: [],
  };

  if (!req.files) return grouped;

  // multer.fields() returns { fieldName: File[] }
  if (typeof req.files === "object" && !Array.isArray(req.files)) {
    for (const [field, files] of Object.entries(req.files)) {
      const list = normalizeUploadedFiles(files);
      if (grouped[field]) grouped[field].push(...list);
      else grouped.images.push(...list);
    }
    return grouped;
  }

  const fileList = normalizeUploadedFiles(req.files);
  for (const file of fileList) {
    const field = file.fieldname || "images";
    if (grouped[field]) grouped[field].push(file);
    else grouped.images.push(file);
  }

  return grouped;
};

const hasUploadedProductFiles = (req) => {
  const grouped = groupUploadedProductFiles(req);
  return Object.values(grouped).some((files) => files.length > 0);
};

const attachVariantImages = async (variants, productId) => {
  if (!variants?.length) return variants;
  const variantIds = variants.map((v) => v.id);
  const placeholders = variantIds.map(() => "?").join(",");
  const images = await query(
    `SELECT id, variant_id, image, sort_order FROM product_variant_images
     WHERE product_id = ? AND variant_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    [productId, ...variantIds]
  );

  const imagesByVariant = {};
  for (const img of images) {
    if (!imagesByVariant[img.variant_id]) imagesByVariant[img.variant_id] = [];
    imagesByVariant[img.variant_id].push(img);
  }

  const colorImageCache = {};
  return variants.map((variant) => {
    let variantImages = imagesByVariant[variant.id] || [];
    if (!variantImages.length) {
      const colorKey = getVariantColorKey(variant.option_values, variant.color);
      if (colorKey && colorImageCache[colorKey]) {
        variantImages = colorImageCache[colorKey];
      }
    } else {
      const colorKey = getVariantColorKey(variant.option_values, variant.color);
      if (colorKey && !colorImageCache[colorKey]) {
        colorImageCache[colorKey] = variantImages;
      }
    }
    return {
      ...variant,
      images: variantImages,
      image: variantImages[0]?.image || variant.image || null,
    };
  });
};

const loadVariantImagesByComboKey = async (conn, productId) => {
  const [rows] = await conn.execute(
    `SELECT pv.id, pv.option_values, pv.color, pvi.image, pvi.sort_order
     FROM product_variants pv
     LEFT JOIN product_variant_images pvi ON pvi.variant_id = pv.id
     WHERE pv.product_id = ?
     ORDER BY pv.id ASC, pvi.sort_order ASC, pvi.id ASC`,
    [productId]
  );

  const imagesByKey = {};
  for (const row of rows) {
    const key = variantComboKey(row.option_values);
    if (!key || !row.image) continue;
    if (!imagesByKey[key]) imagesByKey[key] = [];
    const exists = imagesByKey[key].some((img) => img.image === row.image);
    if (!exists) imagesByKey[key].push({ image: row.image, sort_order: row.sort_order || 0 });
  }
  return imagesByKey;
};

const insertVariantImages = async (conn, storeId, productId, variantId, images) => {
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    await conn.execute(
      "INSERT INTO product_variant_images (store_id, product_id, variant_id, image, sort_order) VALUES (?, ?, ?, ?, ?)",
      [storeId, productId, variantId, img.image, img.sort_order ?? i]
    );
  }
  if (images.length) {
    await conn.execute("UPDATE product_variants SET image = ? WHERE id = ?", [images[0].image, variantId]);
  }
};

const saveProductImagesFromUpload = async (conn, storeId, productId, groupedFiles, removedImageIds = []) => {
  if (removedImageIds.length) {
    const placeholders = removedImageIds.map(() => "?").join(",");
    await conn.execute(
      `DELETE FROM product_images WHERE product_id = ? AND id IN (${placeholders})`,
      [productId, ...removedImageIds]
    );
  }

  const legacyImages = groupedFiles.images || [];
  let thumbnailFiles = groupedFiles.thumbnail?.length
    ? groupedFiles.thumbnail
    : legacyImages.length
      ? [legacyImages[0]]
      : [];
  const galleryFiles = groupedFiles.gallery_images?.length
    ? groupedFiles.gallery_images
    : legacyImages.length > 1
      ? legacyImages.slice(1)
      : [];

  if (!thumbnailFiles.length && galleryFiles.length) {
    thumbnailFiles = [galleryFiles[0]];
  }

  if (thumbnailFiles.length) {
    const thumbPath = `uploads/products/${thumbnailFiles[0].filename}`;
    const [thumbRows] = await conn.execute(
      "SELECT id FROM product_images WHERE product_id = ? AND image_type = 'thumbnail' LIMIT 1",
      [productId]
    );
    if (thumbRows.length) {
      await conn.execute("UPDATE product_images SET image = ? WHERE id = ?", [thumbPath, thumbRows[0].id]);
    } else {
      await conn.execute(
        "INSERT INTO product_images (store_id, product_id, image, image_type, sort_order) VALUES (?, ?, ?, 'thumbnail', 0)",
        [storeId, productId, thumbPath]
      );
    }
    await conn.execute("UPDATE products SET thumbnail = ? WHERE id = ?", [thumbPath, productId]);
  }

  if (galleryFiles.length) {
    const [galleryCountRows] = await conn.execute(
      "SELECT COUNT(*) as total FROM product_images WHERE product_id = ? AND image_type = 'gallery'",
      [productId]
    );
    let gallerySort = galleryCountRows[0]?.total || 0;
    for (const file of galleryFiles) {
      const imagePath = `uploads/products/${file.filename}`;
      await conn.execute(
        "INSERT INTO product_images (store_id, product_id, image, image_type, sort_order) VALUES (?, ?, ?, 'gallery', ?)",
        [storeId, productId, imagePath, gallerySort]
      );
      gallerySort += 1;
    }
  }
};

const applyVariantImageUploads = async (
  conn,
  storeId,
  productId,
  savedVariants,
  variantImageMeta,
  variantImageFiles
) => {
  const meta = parseJsonField(variantImageMeta) || variantImageMeta || {};
  const files = variantImageFiles || [];
  const colorGroups = {};

  for (const variant of savedVariants) {
    const colorKey = getVariantColorKey(variant.options || variant.option_values, variant.color);
    if (!colorKey) continue;
    if (!colorGroups[colorKey]) colorGroups[colorKey] = [];
    colorGroups[colorKey].push(variant);
  }

  for (const [colorKey, variantsForColor] of Object.entries(colorGroups)) {
    const colorMeta = meta[colorKey] || {};
    const newIndexes = Array.isArray(colorMeta.new_file_indexes)
      ? colorMeta.new_file_indexes
      : [];

    const newImages = newIndexes
      .map((idx) => files[idx])
      .filter(Boolean)
      .map((file, i) => ({
        image: `uploads/products/${file.filename}`,
        sort_order: i,
      }));

    if (!newImages.length) continue;

    for (const variant of variantsForColor) {
      const [existingRows] = await conn.execute(
        "SELECT image, sort_order FROM product_variant_images WHERE variant_id = ? ORDER BY sort_order ASC",
        [variant.id]
      );
      const mergedImages = [
        ...existingRows,
        ...newImages.map((img, i) => ({ ...img, sort_order: existingRows.length + i })),
      ];
      await conn.execute("DELETE FROM product_variant_images WHERE variant_id = ?", [variant.id]);
      await insertVariantImages(conn, storeId, productId, variant.id, mergedImages);
    }
  }
};

const syncAllVariantPrices = async (conn, productId, price, offerPrice) => {
  await conn.execute(
    "UPDATE product_variants SET price = ?, offer_price = ? WHERE product_id = ? AND status = 'active'",
    [parsePriceValue(price), parsePriceValue(offerPrice), productId]
  );
};

const toNullableId = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "null" || value === "undefined") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
};

const resolveCategoryIds = (existing, category_id, sub_category_id, child_category_id) => {
  let catId = category_id !== undefined ? toNullableId(category_id) : existing.category_id;
  let subId = sub_category_id !== undefined ? toNullableId(sub_category_id) : existing.sub_category_id;
  let childId = child_category_id !== undefined ? toNullableId(child_category_id) : existing.child_category_id;
  if (!catId) {
    subId = null;
    childId = null;
  } else if (!subId) {
    childId = null;
  }
  return { catId, subId, childId };
};

const cartesianCombinations = (options) => {
  if (!options?.length) return [];
  return options.reduce(
    (acc, opt) => {
      const values = Array.isArray(opt.option_values)
        ? opt.option_values
        : parseJsonField(opt.option_values) || [];
      return acc.flatMap((combo) =>
        values.map((v) => [...combo, { name: opt.option_name, value: v }])
      );
    },
    [[]]
  );
};

async function saveVariantOptionsAndVariants(conn, productId, storeId, variantOptions, variants, price, offerPrice, productStock = 0, variantImageMeta = null, variantImageFiles = []) {
  const options = parseJsonField(variantOptions) || variantOptions;
  if (!options?.length) return null;

  if (variantImageMeta) {
    const meta = parseJsonField(variantImageMeta) || variantImageMeta || {};
    for (const colorMeta of Object.values(meta)) {
      const removedIds = parseIdList(colorMeta.removed_image_ids);
      if (removedIds.length) {
        const placeholders = removedIds.map(() => "?").join(",");
        await conn.execute(
          `DELETE FROM product_variant_images WHERE product_id = ? AND id IN (${placeholders})`,
          [productId, ...removedIds]
        );
      }
    }
  }

  const imagesByComboKey = await loadVariantImagesByComboKey(conn, productId);

  await conn.execute("DELETE FROM product_variant_options WHERE product_id = ?", [productId]);
  await conn.execute("DELETE FROM product_variants WHERE product_id = ?", [productId]);

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const values = Array.isArray(opt.option_values)
      ? opt.option_values
      : parseJsonField(opt.option_values) || [];
    await conn.execute(
      "INSERT INTO product_variant_options (store_id, product_id, option_name, option_values, sort_order) VALUES (?, ?, ?, ?, ?)",
      [storeId, productId, opt.option_name, JSON.stringify(values), opt.sort_order ?? i]
    );
  }

  let variantRows = parseJsonField(variants) || variants || [];
  if (!variantRows.length) {
    const combos = cartesianCombinations(options);
    const defaultStock = parseStockValue(productStock);
    variantRows = combos.map((combo, i) => ({
      options: combo,
      sku: `VAR-${productId}-${String(i).padStart(3, "0")}`,
      price,
      offer_price: offerPrice,
      stock: defaultStock,
    }));
  }

  const savedVariants = [];
  for (let i = 0; i < variantRows.length; i++) {
    const v = variantRows[i];
    const opts = v.options || [];
    const { size, color, fabric, optionValues } = resolveVariantDimensions(
      opts.length
        ? opts
        : [
            v.size ? { name: "Size", value: v.size } : null,
            v.color ? { name: "Color", value: v.color } : null,
            v.fabric ? { name: "Fabric", value: v.fabric } : null,
          ].filter(Boolean)
    );
    const variantSku = String(v.sku || "").trim() || `VAR-${productId}-${String(i).padStart(3, "0")}`;
    const variantStock = parseStockValue(v.stock);
    const variantPrice = parsePriceValue(v.price ?? price, parsePriceValue(price));
    const variantOffer = parsePriceValue(v.offer_price ?? offerPrice, parsePriceValue(offerPrice));
    const [insertResult] = await conn.execute(
      "INSERT INTO product_variants (store_id, product_id, sku, size, color, fabric, option_values, price, offer_price, stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')",
      [
        storeId,
        productId,
        variantSku,
        size,
        color,
        fabric,
        optionValues,
        variantPrice,
        variantOffer,
        variantStock,
      ]
    );

    const variantId = insertResult.insertId;
    const comboKey = variantComboKey(opts.length ? opts : optionValues);
    const preservedImages = imagesByComboKey[comboKey] || [];
    if (preservedImages.length) {
      await insertVariantImages(conn, storeId, productId, variantId, preservedImages);
    }

    savedVariants.push({
      id: variantId,
      sku: variantSku,
      price: variantPrice,
      offer_price: variantOffer,
      stock: variantStock,
      option_values: optionValues,
      options: opts,
      color,
      size,
      fabric,
    });
  }

  if (variantImageMeta) {
    await applyVariantImageUploads(conn, storeId, productId, savedVariants, variantImageMeta, variantImageFiles);
  }

  return savedVariants;
}

async function applyVariantSyncToProduct(conn, productId, savedVariants, fallbackPrice, fallbackOffer, threshold = 5) {
  if (!savedVariants?.length) return null;

  const totalStock = deriveProductStockFromVariants(savedVariants);
  const prices = deriveProductPricesFromVariants(savedVariants, fallbackPrice, fallbackOffer);
  const discount = calculateDiscount(prices.price, prices.offer_price);

  await conn.execute(
    "UPDATE products SET stock = ?, stock_status = ?, price = ?, offer_price = ?, discount_percentage = ? WHERE id = ?",
    [totalStock, resolveStockStatus(totalStock, threshold), prices.price, prices.offer_price, discount, productId]
  );
  await syncProductInventory(conn, productId, totalStock, threshold);

  return { stock: totalStock, ...prices, discount_percentage: discount };
}

async function syncProductCollections(conn, productId, collectionIds, storeId) {
  if (collectionIds === undefined) return;

  const ids = parseCollectionIds(collectionIds);
  await conn.execute("DELETE FROM collection_products WHERE product_id = ? AND store_id = ?", [productId, storeId]);

  for (let i = 0; i < ids.length; i++) {
    await conn.execute(
      "INSERT INTO collection_products (store_id, collection_id, product_id, sort_order) VALUES (?, ?, ?, ?)",
      [storeId, ids[i], productId, i]
    );
  }
}

async function saveProductSeoData(conn, productId, seoData) {
  const seo = parseJsonField(seoData) || seoData;
  if (!seo) return;

  const { seo_title, seo_description } = seo;
  if (!seo_title && !seo_description) return;

  const [existing] = await conn.execute("SELECT id FROM product_seo WHERE product_id = ?", [productId]);
  if (existing.length) {
    await conn.execute(
      "UPDATE product_seo SET seo_title = ?, seo_description = ? WHERE product_id = ?",
      [seo_title || null, seo_description || null, productId]
    );
  } else {
    await conn.execute(
      "INSERT INTO product_seo (product_id, seo_title, seo_description) VALUES (?, ?, ?)",
      [productId, seo_title || null, seo_description || null]
    );
  }
}

const checkProductSlug = async (slug, storeId, excludeId = null) => {
  let sql = "SELECT id FROM products WHERE slug = ? AND store_id = ?";
  const params = [slug, storeId];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.length > 0 ? result[0] : null;
};

// @desc    Get all products with filters, pagination, sorting
// @route   GET /api/products
const getProducts = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const status = req.query.status || "";
    const category_id = req.query.category_id || "";
    const sub_category_id = req.query.sub_category_id || "";
    const child_category_id = req.query.child_category_id || "";
    const featured = req.query.featured || "";
    const trending = req.query.trending || "";
    const best_seller = req.query.best_seller || "";
    const stock_status = req.query.stock_status || "";
    const min_price = req.query.min_price || "";
    const max_price = req.query.max_price || "";
    const sort = req.query.sort || "created_at";
    const order = req.query.order || "DESC";

    let whereClause = "WHERE p.store_id = ?";
    const params = [storeId];

    if (search) {
      whereClause += " AND (p.name LIKE ? OR p.sku LIKE ? OR p.tags LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { whereClause += " AND p.status = ?"; params.push(status); }
    if (category_id) { whereClause += " AND p.category_id = ?"; params.push(category_id); }
    if (sub_category_id) { whereClause += " AND p.sub_category_id = ?"; params.push(sub_category_id); }
    if (child_category_id) { whereClause += " AND p.child_category_id = ?"; params.push(child_category_id); }
    if (featured === "true") { whereClause += " AND p.is_featured = 1"; }
    if (trending === "true") { whereClause += " AND p.is_trending = 1"; }
    if (best_seller === "true") { whereClause += " AND p.is_best_seller = 1"; }
    if (stock_status === "in_stock") { whereClause += " AND p.stock > 0"; }
    if (stock_status === "out_of_stock") { whereClause += " AND p.stock <= 0"; }
    if (stock_status === "low_stock") { whereClause += " AND p.stock <= p.low_stock_threshold AND p.stock > 0"; }
    if (min_price) { whereClause += " AND p.price >= ?"; params.push(min_price); }
    if (max_price) { whereClause += " AND p.price <= ?"; params.push(max_price); }

    const allowedSorts = ["created_at", "name", "price", "total_sales", "stock"];
    const sortColumn = allowedSorts.includes(sort) ? `p.${sort}` : "p.created_at";
    const sortOrder = order === "ASC" ? "ASC" : "DESC";

    const countResult = await query(`SELECT COUNT(*) as total FROM products p ${whereClause}`, params);
    const total = countResult[0].total;

    const products = await query(
      `SELECT p.*, 
        c.name as category_name, sc.name as sub_category_name, cc.name as child_category_name
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id 
       LEFT JOIN child_categories cc ON p.child_category_id = cc.id 
       ${whereClause} 
       ORDER BY ${sortColumn} ${sortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    // Get images and variant metadata for each product
    const productIds = products.map((p) => p.id);
    let variantsByProduct = {};
    if (productIds.length) {
      const placeholders = productIds.map(() => "?").join(",");
      const allVariants = await query(
        `SELECT product_id, sku, option_values, stock, price, offer_price
         FROM product_variants
         WHERE product_id IN (${placeholders}) AND status = 'active'`,
        productIds
      );
      for (const variant of allVariants) {
        if (!variantsByProduct[variant.product_id]) variantsByProduct[variant.product_id] = [];
        variantsByProduct[variant.product_id].push(variant);
      }
    }

    for (const product of products) {
      const images = await query(
        "SELECT id, image, image_type, sort_order, alt_text FROM product_images WHERE product_id = ? ORDER BY sort_order ASC",
        [product.id]
      );
      product.images = images;
      const thumbImg = images.find((img) => img.image_type === "thumbnail") || images[0];
      product.thumbnail = thumbImg?.image || product.thumbnail || null;

      const productVariants = variantsByProduct[product.id] || [];
      product.variant_count = productVariants.length;
      product.fabric = collectProductFabrics(productVariants);
      if (productVariants.length) {
        product.stock = deriveProductStockFromVariants(productVariants);
        const prices = deriveProductPricesFromVariants(productVariants, product.price, product.offer_price);
        product.price = prices.price;
        product.offer_price = prices.offer_price;
      }
    }

    try {
      await attachColorVariantSummaries(products);
    } catch (summaryError) {
      logger.error("attachColorVariantSummaries error:", summaryError);
      for (const product of products) {
        product.color_variants = product.color_variants || [];
      }
    }

    return paginatedResponse(res, products, total, page, limit);
  } catch (error) {
    logger.error("Get products error:", error);
    return errorResponse(res, "Failed to fetch products", 500);
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
const getProduct = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const products = await query(
      `SELECT p.*, 
        c.name as category_name, c.slug as category_slug,
        sc.name as sub_category_name, sc.slug as sub_category_slug,
        cc.name as child_category_name, cc.slug as child_category_slug
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id AND c.store_id = p.store_id
       LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id AND sc.store_id = p.store_id
       LEFT JOIN child_categories cc ON p.child_category_id = cc.id AND cc.store_id = p.store_id
       WHERE p.id = ? AND p.store_id = ?`,
      [req.params.id, storeId]
    );

    if (!products.length) {
      return errorResponse(res, "Product not found", 404);
    }

    const product = products[0];
    product.images = await query("SELECT id, image, image_type, sort_order, alt_text FROM product_images WHERE product_id = ? ORDER BY sort_order ASC", [product.id]);
    product.variants = await query("SELECT * FROM product_variants WHERE product_id = ? AND status = 'active'", [product.id]);
    product.variants = await attachVariantImages(product.variants, product.id);
    product.fabric = collectProductFabrics(product.variants);
    if (product.variants.length) {
      product.stock = deriveProductStockFromVariants(product.variants);
      const prices = deriveProductPricesFromVariants(product.variants, product.price, product.offer_price);
      product.price = prices.price;
      product.offer_price = prices.offer_price;
    }
    const thumbImg = product.images.find((img) => img.image_type === "thumbnail") || product.images[0];
    product.thumbnail = thumbImg?.image || product.thumbnail || null;
    product.inventory = await query("SELECT * FROM inventory WHERE product_id = ?", [product.id]);
    const collectionRows = await query(
      "SELECT collection_id FROM collection_products WHERE product_id = ? ORDER BY sort_order ASC",
      [product.id]
    );
    product.collection_ids = collectionRows.map((r) => r.collection_id);

    return successResponse(res, product);
  } catch (error) {
    logger.error("Get product error:", error);
    return errorResponse(res, "Failed to fetch product", 500);
  }
};

// @desc    Get product by slug
// @route   GET /api/products/slug/:slug
const getProductBySlug = async (req, res) => {
  try {
    const storeId = getStoreId(req);

    const products = await query(
      `SELECT p.*, 
        c.name as category_name, c.slug as category_slug,
        sc.name as sub_category_name, sc.slug as sub_category_slug,
        cc.name as child_category_name, cc.slug as child_category_slug
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id AND c.store_id = p.store_id
       LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id AND sc.store_id = p.store_id
       LEFT JOIN child_categories cc ON p.child_category_id = cc.id AND cc.store_id = p.store_id
       WHERE p.slug = ? AND p.store_id = ? AND p.status = 'active'`,
      [req.params.slug, storeId]
    );

    if (!products.length) {
      return errorResponse(res, "Product not found", 404);
    }

    const product = products[0];

    product.images = await query(
      "SELECT id, image, image_type, sort_order, alt_text FROM product_images WHERE product_id = ? ORDER BY sort_order ASC",
      [product.id]
    );

    product.variants = await query(
      `SELECT id, store_id, product_id, sku, size, color, fabric, option_values,
              price, offer_price, stock, image, status
      FROM product_variants
      WHERE product_id = ? AND store_id = ? AND status = 'active'
      ORDER BY id ASC`,
      [product.id, storeId]
    );
    product.variants = await attachVariantImages(product.variants, product.id);
    // product.variants = await query(
    //   "SELECT id, product_id, sku, size, color, option_values, price, offer_price, stock, status FROM product_variants WHERE product_id = ? AND status = 'active' ORDER BY id ASC",
    //   [product.id]
    // );

    product.variant_options = await query(
      "SELECT id, product_id, option_name, option_values, sort_order FROM product_variant_options WHERE product_id = ? ORDER BY sort_order ASC",
      [product.id]
    );

    product.fabric = collectProductFabrics(product.variants);

    if (product.variants.length) {
      product.stock = deriveProductStockFromVariants(product.variants);

      const prices = deriveProductPricesFromVariants(
        product.variants,
        product.price,
        product.offer_price
      );

      product.price = prices.price;
      product.offer_price = prices.offer_price;
    }

    const thumbImg =
      product.images.find((img) => img.image_type === "thumbnail") ||
      product.images[0];

    product.thumbnail = thumbImg?.image || product.thumbnail || null;

    return successResponse(res, product);
  } catch (error) {
    logger.error("Get product by slug error:", error);
    return errorResponse(res, "Failed to fetch product", 500);
  }
};
// const getProductBySlug = async (req, res) => {
//   try {
//     const storeId = getStoreId(req);
//     const products = await query(
//       `SELECT p.*, 
//         c.name as category_name, c.slug as category_slug,
//         sc.name as sub_category_name, sc.slug as sub_category_slug
//        FROM products p 
//        LEFT JOIN categories c ON p.category_id = c.id AND c.store_id = p.store_id
//        LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id AND sc.store_id = p.store_id
//        WHERE p.slug = ? AND p.store_id = ? AND p.status = 'active'`,
//       [req.params.slug, storeId]
//     );

//     if (!products.length) {
//       return errorResponse(res, "Product not found", 404);
//     }

//     return successResponse(res, products[0]);
//   } catch (error) {
//     logger.error("Get product by slug error:", error);
//     return errorResponse(res, "Failed to fetch product", 500);
//   }
// };

// @desc    Create product
// @route   POST /api/products
const createProduct = async (req, res) => {
  const conn = await getConnection();
  try {
    const storeId = getStoreId(req);
    const {
      name, slug: slugInput, category_id, sub_category_id, child_category_id,
      brand, vendor, product_type, price, offer_price, cost_price, stock,
      short_description, long_description, tags,
      video_url, gst_percent, shipping_charge,
      is_featured, is_trending, is_best_seller, is_new_arrival, status,
      meta_title, meta_description, meta_keywords,
      variant_options, variants, seo_data, collection_ids,
      removed_image_ids, variant_image_meta, sync_variant_prices,
    } = req.body;

    const slug = slugInput?.trim()
      ? await generateUniqueSlug((s, id) => checkProductSlug(s, storeId, id), slugInput.trim())
      : await generateUniqueSlug((s, id) => checkProductSlug(s, storeId, id), name);
    const sku = generateSKU(category_id ? "cat" : "gen", name, Date.now());
    const discount = calculateDiscount(parseFloat(price), parseFloat(offer_price));
    const low_stock_threshold = 5;
    const stockQty = parseStockValue(stock);
    const stockStatus = stockQty <= 0 ? "out_of_stock" : stockQty <= low_stock_threshold ? "low_stock" : "in_stock";

    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO products (store_id, name, slug, sku, category_id, sub_category_id, child_category_id, brand, vendor, product_type, price, offer_price, discount_percentage, cost_price, stock, stock_status, low_stock_threshold, short_description, long_description, tags, video_url, gst_percent, shipping_charge, is_featured, is_trending, is_best_seller, is_new_arrival, status, meta_title, meta_description, meta_keywords, created_by, updated_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        name, slug, sku, category_id || null, sub_category_id || null, child_category_id || null,
        brand || null, vendor || null, product_type || null,
        price || 0, offer_price || 0, discount, cost_price || 0, stockQty, stockStatus, low_stock_threshold,
        short_description || null, long_description || null, tags || null,
        video_url || null, gst_percent || 0, shipping_charge || 0,
        is_featured || 0, is_trending || 0, is_best_seller || 0, is_new_arrival || 0, status || "draft",
        meta_title || null, meta_description || null, meta_keywords || null,
        req.admin?.id || null, req.admin?.id || null,
      ]
    );

    const productId = result.insertId;

    await conn.execute(
      "INSERT INTO inventory (store_id, product_id, quantity, available_quantity, low_stock_threshold) VALUES (?, ?, ?, ?, ?)",
      [storeId, productId, stockQty, stockQty, low_stock_threshold]
    );

    const groupedFiles = groupUploadedProductFiles(req);
    if (hasUploadedProductFiles(req)) {
      await saveProductImagesFromUpload(conn, storeId, productId, groupedFiles, []);
    } else if (req.body.thumbnail) {
      await conn.execute(
        "INSERT INTO product_images (store_id, product_id, image, image_type, sort_order) VALUES (?, ?, ?, 'thumbnail', 0)",
        [storeId, productId, req.body.thumbnail]
      );
      await conn.execute("UPDATE products SET thumbnail = ? WHERE id = ?", [req.body.thumbnail, productId]);
    }

    if (variant_options) {
      const savedVariants = await saveVariantOptionsAndVariants(
        conn,
        productId,
        storeId,
        variant_options,
        variants,
        price,
        offer_price,
        stockQty,
        variant_image_meta,
        groupedFiles.variant_images
      );
      await applyVariantSyncToProduct(conn, productId, savedVariants, price, offer_price, low_stock_threshold);
    }

    if (seo_data) {
      await saveProductSeoData(conn, productId, seo_data);
    }

    if (collection_ids !== undefined) {
      await syncProductCollections(conn, productId, collection_ids, storeId);
    }

    await conn.commit();

    const product = await query("SELECT * FROM products WHERE id = ? AND store_id = ?", [productId, storeId]);
    return successResponse(res, product[0], "Product created successfully", 201);
  } catch (error) {
    await conn.rollback();
    logger.error("Create product error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to create product", 500);
  } finally {
    conn.release();
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
const updateProduct = async (req, res) => {
  const conn = await getConnection();
  try {
    const storeId = getStoreId(req);
    const productId = req.params.id;
    const existing = await query("SELECT * FROM products WHERE id = ? AND store_id = ?", [productId, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);

    const {
      name, slug: slugInput, category_id, sub_category_id, child_category_id,
      brand, vendor, product_type, price, offer_price, cost_price, stock,
      short_description, long_description, tags,
      video_url, gst_percent, shipping_charge,
      is_featured, is_trending, is_best_seller, is_new_arrival, status,
      meta_title, meta_description, meta_keywords,
      variant_options, variants, seo_data, collection_ids,
      removed_image_ids, variant_image_meta, sync_variant_prices,
    } = req.body;

    let slug = existing[0].slug;
    if (slugInput?.trim()) {
      slug = await generateUniqueSlug((s, id) => checkProductSlug(s, storeId, id), slugInput.trim(), productId);
    } else if (name && name !== existing[0].name) {
      slug = await generateUniqueSlug((s, id) => checkProductSlug(s, storeId, id), name, productId);
    }

    const finalPrice = price !== undefined ? price : existing[0].price;
    const finalOfferPrice = offer_price !== undefined ? offer_price : existing[0].offer_price;
    const discount = calculateDiscount(parseFloat(finalPrice), parseFloat(finalOfferPrice));
    const finalStock = stock !== undefined ? parseStockValue(stock) : existing[0].stock;
    const low_stock_threshold = existing[0].low_stock_threshold || 5;
    const stockStatus = finalStock <= 0 ? "out_of_stock" : finalStock <= low_stock_threshold ? "low_stock" : "in_stock";

    const { catId, subId, childId } = resolveCategoryIds(
      existing[0],
      category_id,
      sub_category_id,
      child_category_id
    );

    await conn.beginTransaction();

    await conn.execute(
      `UPDATE products SET 
        name = ?, slug = ?, category_id = ?, sub_category_id = ?, child_category_id = ?,
        brand = ?, vendor = ?, product_type = ?,
        price = ?, offer_price = ?, discount_percentage = ?, cost_price = ?,
        stock = ?, stock_status = ?,
        short_description = ?, long_description = ?, tags = ?,
        video_url = ?, gst_percent = ?, shipping_charge = ?,
        is_featured = ?, is_trending = ?, is_best_seller = ?, is_new_arrival = ?, status = ?,
        meta_title = ?, meta_description = ?, meta_keywords = ?, updated_by = ?
      WHERE id = ? AND store_id = ?`,
      [
        name || existing[0].name, slug,
        catId, subId, childId,
        brand !== undefined ? brand : existing[0].brand,
        vendor !== undefined ? vendor : existing[0].vendor,
        product_type !== undefined ? product_type : existing[0].product_type,
        finalPrice, finalOfferPrice,
        discount, cost_price !== undefined ? cost_price : existing[0].cost_price,
        finalStock, stockStatus,
        short_description !== undefined ? short_description : existing[0].short_description,
        long_description !== undefined ? long_description : existing[0].long_description,
        tags !== undefined ? tags : existing[0].tags,
        video_url !== undefined ? video_url : existing[0].video_url,
        gst_percent !== undefined ? gst_percent : existing[0].gst_percent,
        shipping_charge !== undefined ? shipping_charge : existing[0].shipping_charge,
        is_featured !== undefined ? is_featured : existing[0].is_featured,
        is_trending !== undefined ? is_trending : existing[0].is_trending,
        is_best_seller !== undefined ? is_best_seller : existing[0].is_best_seller,
        is_new_arrival !== undefined ? is_new_arrival : existing[0].is_new_arrival,
        status || existing[0].status,
        meta_title !== undefined ? meta_title : existing[0].meta_title,
        meta_description !== undefined ? meta_description : existing[0].meta_description,
        meta_keywords !== undefined ? meta_keywords : existing[0].meta_keywords,
        req.admin?.id || null, productId, storeId,
      ]
    );

    const groupedFiles = groupUploadedProductFiles(req);
    if (hasUploadedProductFiles(req)) {
      const removedIds = parseIdList(removed_image_ids);
      await saveProductImagesFromUpload(conn, storeId, productId, groupedFiles, removedIds);
    } else if (removed_image_ids) {
      const removedIds = parseIdList(removed_image_ids);
      if (removedIds.length) {
        const placeholders = removedIds.map(() => "?").join(",");
        await conn.execute(
          `DELETE FROM product_images WHERE product_id = ? AND id IN (${placeholders})`,
          [productId, ...removedIds]
        );
      }
    }

    if (variant_options) {
      const savedVariants = await saveVariantOptionsAndVariants(
        conn,
        productId,
        storeId,
        variant_options,
        variants,
        finalPrice,
        finalOfferPrice,
        finalStock,
        variant_image_meta,
        groupedFiles.variant_images
      );
      await applyVariantSyncToProduct(
        conn,
        productId,
        savedVariants,
        finalPrice,
        finalOfferPrice,
        low_stock_threshold
      );
    } else if (stock !== undefined) {
      await syncProductInventory(conn, productId, finalStock, low_stock_threshold);
    }

    if (sync_variant_prices === "1" || sync_variant_prices === true) {
      await syncAllVariantPrices(conn, productId, finalPrice, finalOfferPrice);
    }

    if (seo_data) {
      await saveProductSeoData(conn, productId, seo_data);
    }

    if (collection_ids !== undefined) {
      await syncProductCollections(conn, productId, collection_ids, storeId);
    }

    await conn.commit();

    const product = await query("SELECT * FROM products WHERE id = ? AND store_id = ?", [productId, storeId]);
    return successResponse(res, product[0], "Product updated successfully");
  } catch (error) {
    await conn.rollback();
    logger.error("Update product error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to update product", 500);
  } finally {
    conn.release();
  }
};

// @desc    Delete product (permanent)
// @route   DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);
    await query("DELETE FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    return successResponse(res, null, "Product deleted successfully");
  } catch (error) {
    logger.error("Delete product error:", error);
    return errorResponse(res, "Failed to delete product", 500);
  }
};

// @desc    Bulk delete products
// @route   POST /api/products/bulk-delete
const bulkDeleteProducts = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) {
      return errorResponse(res, "Product IDs are required", 400);
    }
    const placeholders = ids.map(() => "?").join(",");
    await query(`DELETE FROM products WHERE store_id = ? AND id IN (${placeholders})`, [storeId, ...ids]);
    return successResponse(res, null, `${ids.length} products deleted successfully`);
  } catch (error) {
    logger.error("Bulk delete error:", error);
    return errorResponse(res, "Failed to delete products", 500);
  }
};

// @desc    Bulk upload products (Excel/CSV)
// @route   POST /api/products/bulk-upload
const bulkUploadProducts = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { products } = req.body;
    if (!products || !Array.isArray(products) || !products.length) {
      return errorResponse(res, "Products array is required", 400);
    }

    let created = 0;
    for (const product of products) {
      const slug = await generateUniqueSlug((s, id) => checkProductSlug(s, storeId, id), product.name);
      const sku = generateSKU("bulk", product.name, Date.now() + created);
      const discount = calculateDiscount(parseFloat(product.price), parseFloat(product.offer_price));

      await query(
        `INSERT INTO products (store_id, name, slug, sku, category_id, price, offer_price, discount_percentage, stock, status, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [storeId, product.name, slug, sku, product.category_id || null, product.price || 0, product.offer_price || 0, discount, product.stock || 0, "active", req.admin?.id || null]
      );
      created++;
    }

    return successResponse(res, { created }, `${created} products uploaded successfully`, 201);
  } catch (error) {
    logger.error("Bulk upload error:", error);
    return errorResponse(res, "Failed to upload products", 500);
  }
};

// @desc    Toggle featured
// @route   PUT /api/products/:id/featured
const toggleFeatured = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id, is_featured FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);
    const newVal = existing[0].is_featured ? 0 : 1;
    await query("UPDATE products SET is_featured = ? WHERE id = ? AND store_id = ?", [newVal, req.params.id, storeId]);
    return successResponse(res, { is_featured: newVal }, newVal ? "Product marked as featured" : "Product unmarked as featured");
  } catch (error) {
    logger.error("Toggle featured error:", error);
    return errorResponse(res, "Failed to toggle featured", 500);
  }
};

// @desc    Toggle trending
// @route   PUT /api/products/:id/trending
const toggleTrending = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id, is_trending FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);
    const newVal = existing[0].is_trending ? 0 : 1;
    await query("UPDATE products SET is_trending = ? WHERE id = ? AND store_id = ?", [newVal, req.params.id, storeId]);
    return successResponse(res, { is_trending: newVal }, newVal ? "Product marked as trending" : "Product unmarked as trending");
  } catch (error) {
    logger.error("Toggle trending error:", error);
    return errorResponse(res, "Failed to toggle trending", 500);
  }
};

// @desc    Toggle best seller
// @route   PUT /api/products/:id/best-seller
const toggleBestSeller = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const existing = await query("SELECT id, is_best_seller FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);
    const newVal = existing[0].is_best_seller ? 0 : 1;
    await query("UPDATE products SET is_best_seller = ? WHERE id = ? AND store_id = ?", [newVal, req.params.id, storeId]);
    return successResponse(res, { is_best_seller: newVal }, newVal ? "Product marked as best seller" : "Product unmarked as best seller");
  } catch (error) {
    logger.error("Toggle best seller error:", error);
    return errorResponse(res, "Failed to toggle best seller", 500);
  }
};

// @desc    Update product status
// @route   PUT /api/products/:id/status
const updateProductStatus = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { status } = req.body;
    if (!["active", "inactive", "draft"].includes(status)) {
      return errorResponse(res, "Invalid status", 400);
    }
    const existing = await query("SELECT id FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);
    await query("UPDATE products SET status = ? WHERE id = ? AND store_id = ?", [status, req.params.id, storeId]);
    return successResponse(res, { status }, "Product status updated");
  } catch (error) {
    logger.error("Update product status error:", error);
    return errorResponse(res, "Failed to update status", 500);
  }
};

// @desc    Update stock
// @route   PUT /api/products/:id/stock
const updateStock = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { stock } = req.body;
    if (stock === undefined || stock < 0) {
      return errorResponse(res, "Valid stock quantity is required", 400);
    }
    const existing = await query("SELECT id, stock FROM products WHERE id = ? AND store_id = ?", [req.params.id, storeId]);
    if (!existing.length) return errorResponse(res, "Product not found", 404);

    const previousStock = existing[0].stock;
    await query("UPDATE products SET stock = ? WHERE id = ? AND store_id = ?", [stock, req.params.id, storeId]);
    await query("UPDATE inventory SET quantity = ?, available_quantity = ? WHERE product_id = ? AND store_id = ?", [stock, stock, req.params.id, storeId]);

    await query(
      "INSERT INTO inventory_logs (store_id, product_id, type, quantity, previous_quantity, new_quantity, reference_type, notes, created_by) VALUES (?, ?, 'adjustment', ?, ?, ?, 'manual', ?, ?)",
      [storeId, req.params.id, stock - previousStock, previousStock, stock, "Stock updated manually", req.admin?.id || null]
    );

    return successResponse(res, { stock }, "Stock updated successfully");
  } catch (error) {
    logger.error("Update stock error:", error);
    return errorResponse(res, "Failed to update stock", 500);
  }
};

// @desc    Delete product image
// @route   DELETE /api/products/:id/images/:imageId
const deleteProductImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const images = await query("SELECT id, image FROM product_images WHERE id = ? AND product_id = ?", [imageId, id]);
    if (!images.length) return errorResponse(res, "Image not found", 404);
    await query("DELETE FROM product_images WHERE id = ?", [imageId]);
    return successResponse(res, null, "Image deleted successfully");
  } catch (error) {
    logger.error("Delete product image error:", error);
    return errorResponse(res, "Failed to delete image", 500);
  }
};

// @desc    Export products to Excel
// @route   GET /api/products/export/excel
const exportProductsExcel = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const products = await query(
      `SELECT p.name, p.sku, p.price, p.offer_price, p.discount_percentage, p.stock, 
        p.brand, p.status, p.total_sales, c.name as category
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id AND c.store_id = p.store_id
       WHERE p.store_id = ?
       ORDER BY p.name ASC`,
      [storeId]
    );

    return successResponse(res, products);
  } catch (error) {
    logger.error("Export products error:", error);
    return errorResponse(res, "Failed to export products", 500);
  }
};

// ============================================================
// PRODUCT VARIANT OPTIONS CRUD
// ============================================================

// @desc    Get variant options for a product
// @route   GET /api/products/:productId/variant-options
const getVariantOptions = async (req, res) => {
  try {
    const options = await query(
      "SELECT * FROM product_variant_options WHERE product_id = ? ORDER BY sort_order ASC",
      [req.params.productId]
    );
    return successResponse(res, options);
  } catch (error) {
    logger.error("Get variant options error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to fetch variant options", 500);
  }
};

// @desc    Create variant option (e.g. Size: [S, M, L])
// @route   POST /api/products/:productId/variant-options
const createVariantOption = async (req, res) => {
  try {
    const { option_name, option_values, sort_order } = req.body;
    if (!option_name || !option_values) {
      return errorResponse(res, "Option name and values are required", 400);
    }

    const values = Array.isArray(option_values) ? option_values : JSON.parse(option_values);
    const result = await query(
      "INSERT INTO product_variant_options (product_id, option_name, option_values, sort_order) VALUES (?, ?, ?, ?)",
      [req.params.productId, option_name, JSON.stringify(values), sort_order || 0]
    );

    const option = await query("SELECT * FROM product_variant_options WHERE id = ?", [result.insertId]);
    return successResponse(res, option[0], "Variant option created", 201);
  } catch (error) {
    logger.error("Create variant option error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to create variant option", 500);
  }
};

// @desc    Update variant option
// @route   PUT /api/products/:productId/variant-options/:optionId
const updateVariantOption = async (req, res) => {
  try {
    const { option_name, option_values, sort_order } = req.body;
    const existing = await query(
      "SELECT id FROM product_variant_options WHERE id = ? AND product_id = ?",
      [req.params.optionId, req.params.productId]
    );
    if (!existing.length) return errorResponse(res, "Variant option not found", 404);

    const updates = [];
    const params = [];
    if (option_name !== undefined) {
      updates.push("option_name = ?");
      params.push(option_name);
    }
    if (option_values !== undefined) {
      const values = Array.isArray(option_values) ? option_values : JSON.parse(option_values);
      updates.push("option_values = ?");
      params.push(JSON.stringify(values));
    }
    if (sort_order !== undefined) {
      updates.push("sort_order = ?");
      params.push(sort_order);
    }

    if (updates.length) {
      params.push(req.params.optionId);
      await query(`UPDATE product_variant_options SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    const option = await query("SELECT * FROM product_variant_options WHERE id = ?", [req.params.optionId]);
    return successResponse(res, option[0], "Variant option updated");
  } catch (error) {
    logger.error("Update variant option error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to update variant option", 500);
  }
};

// @desc    Delete variant option
// @route   DELETE /api/products/:productId/variant-options/:optionId
const deleteVariantOption = async (req, res) => {
  try {
    const existing = await query(
      "SELECT id FROM product_variant_options WHERE id = ? AND product_id = ?",
      [req.params.optionId, req.params.productId]
    );
    if (!existing.length) return errorResponse(res, "Variant option not found", 404);

    await query("DELETE FROM product_variant_options WHERE id = ?", [req.params.optionId]);
    return successResponse(res, null, "Variant option deleted");
  } catch (error) {
    logger.error("Delete variant option error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to delete variant option", 500);
  }
};

// @desc    Auto-generate variant combinations from options
// @route   POST /api/products/:productId/variant-combinations/generate
const generateVariantCombinations = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const productId = req.params.productId;
    const [product] = await query("SELECT id, price, offer_price FROM products WHERE id = ? AND store_id = ?", [productId, storeId]);
    if (!product) return errorResponse(res, "Product not found", 404);

    const options = await query(
      "SELECT * FROM product_variant_options WHERE product_id = ? ORDER BY sort_order ASC",
      [productId]
    );
    if (options.length === 0) {
      return errorResponse(res, "No variant options defined for this product", 400);
    }

    // Generate Cartesian product of all option values
    const optionArrays = options.map((opt) => ({
      name: opt.option_name,
      values: JSON.parse(opt.option_values),
    }));

    const cartesian = (arr) => {
      return arr.reduce((acc, curr) => {
        return acc.flatMap((a) => curr.values.map((v) => [...a, { name: curr.name, value: v }]));
      }, [[]]);
    };

    const combinations = cartesian(optionArrays);

    // Delete existing combinations, then insert new ones
    await query("DELETE FROM product_variants WHERE product_id = ?", [productId]);

    let count = 0;
    for (const combo of combinations) {
      const { size, color, optionValues } = resolveVariantDimensions(combo);
      const sku = `VAR-${productId}-${String(count).padStart(3, "0")}`;

      await query(
        "INSERT INTO product_variants (product_id, sku, size, color, option_values, price, offer_price, stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
        [productId, sku, size, color, optionValues, product.price, product.offer_price, 0]
      );
      count++;
    }

    const variants = await query(
      "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC",
      [productId]
    );

    return successResponse(res, { variants, generated: count }, `${count} variant combinations generated`);
  } catch (error) {
    logger.error("Generate variant combinations error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to generate variant combinations", 500);
  }
};

// @desc    Update a variant combination
// @route   PUT /api/products/:productId/variants/:variantId
const updateVariant = async (req, res) => {
  try {
    const variantId = req.params.variantId;
    const existing = await query("SELECT id FROM product_variants WHERE id = ? AND product_id = ?", [variantId, req.params.productId]);
    if (!existing.length) return errorResponse(res, "Variant not found", 404);

    const { sku, size, color, price, offer_price, stock, image, status, options } = req.body;
    const updates = [];
    const params = [];

    if (sku !== undefined) { updates.push("sku = ?"); params.push(sku); }
    if (options !== undefined) {
      const parsed = parseJsonField(options) || options;
      const { size: s, color: c, optionValues } = resolveVariantDimensions(parsed);
      updates.push("size = ?"); params.push(s);
      updates.push("color = ?"); params.push(c);
      updates.push("option_values = ?"); params.push(optionValues);
    } else {
      if (size !== undefined) { updates.push("size = ?"); params.push(size); }
      if (color !== undefined) { updates.push("color = ?"); params.push(color); }
    }
    if (price !== undefined) { updates.push("price = ?"); params.push(price); }
    if (offer_price !== undefined) { updates.push("offer_price = ?"); params.push(offer_price); }
    if (stock !== undefined) { updates.push("stock = ?"); params.push(stock); }
    if (image !== undefined) { updates.push("image = ?"); params.push(image); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }

    if (!updates.length) return errorResponse(res, "No fields to update", 400);

    params.push(variantId);
    await query(`UPDATE product_variants SET ${updates.join(", ")} WHERE id = ?`, params);

    const variant = await query("SELECT * FROM product_variants WHERE id = ?", [variantId]);
    return successResponse(res, variant[0], "Variant updated");
  } catch (error) {
    logger.error("Update variant error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to update variant", 500);
  }
};

// @desc    Delete a variant
// @route   DELETE /api/products/:productId/variants/:variantId
const deleteVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const existing = await query(
      "SELECT id FROM product_variants WHERE id = ? AND product_id = ?",
      [variantId, productId]
    );
    if (!existing.length) return errorResponse(res, "Variant not found", 404);

    await query("DELETE FROM product_variants WHERE id = ?", [variantId]);
    return successResponse(res, null, "Variant deleted");
  } catch (error) {
    logger.error("Delete variant error:", error);
    return errorResponse(res, process.env.NODE_ENV === "development" ? error.message : "Failed to delete variant", 500);
  }
};

// ============================================================
// PRODUCT SEO CRUD
// ============================================================

// @desc    Get SEO data for a product
// @route   GET /api/products/:productId/seo
const getProductSeo = async (req, res) => {
  try {
    const [seo] = await query("SELECT * FROM product_seo WHERE product_id = ?", [req.params.productId]);
    return successResponse(res, seo || null);
  } catch (error) {
    logger.error("Get product SEO error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to fetch product SEO", 500);
  }
};

// @desc    Create or update SEO data for a product
// @route   PUT /api/products/:productId/seo
const updateProductSeo = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const productId = req.params.productId;
    const [product] = await query("SELECT id FROM products WHERE id = ? AND store_id = ?", [productId, storeId]);
    if (!product) return errorResponse(res, "Product not found", 404);

    const {
      seo_title, seo_description, keywords, canonical_url, meta_robots,
      og_title, og_description, og_image,
      twitter_title, twitter_description, twitter_image,
    } = req.body;

    const [existing] = await query("SELECT id FROM product_seo WHERE product_id = ?", [productId]);

    if (existing) {
      await query(
        `UPDATE product_seo SET
          seo_title = ?, seo_description = ?, keywords = ?, canonical_url = ?, meta_robots = ?,
          og_title = ?, og_description = ?, og_image = ?,
          twitter_title = ?, twitter_description = ?, twitter_image = ?
        WHERE product_id = ?`,
        [
          seo_title || null, seo_description || null, keywords || null, canonical_url || null, meta_robots || "index,follow",
          og_title || null, og_description || null, og_image || null,
          twitter_title || null, twitter_description || null, twitter_image || null,
          productId,
        ]
      );
    } else {
      await query(
        `INSERT INTO product_seo (product_id, seo_title, seo_description, keywords, canonical_url, meta_robots,
          og_title, og_description, og_image, twitter_title, twitter_description, twitter_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId, seo_title || null, seo_description || null, keywords || null, canonical_url || null, meta_robots || "index,follow",
          og_title || null, og_description || null, og_image || null,
          twitter_title || null, twitter_description || null, twitter_image || null,
        ]
      );
    }

    const [seo] = await query("SELECT * FROM product_seo WHERE product_id = ?", [productId]);
    return successResponse(res, seo, "Product SEO saved successfully");
  } catch (error) {
    logger.error("Update product SEO error:", error);
    return errorResponse(res, process.env.NODE_ENV === 'development' ? error.message : "Failed to update product SEO", 500);
  }
};

module.exports.getProducts = getProducts;
module.exports.getProduct = getProduct;
module.exports.getProductBySlug = getProductBySlug;
module.exports.createProduct = createProduct;
module.exports.updateProduct = updateProduct;
module.exports.deleteProduct = deleteProduct;
module.exports.bulkDeleteProducts = bulkDeleteProducts;
module.exports.bulkUploadProducts = bulkUploadProducts;
module.exports.toggleFeatured = toggleFeatured;
module.exports.toggleTrending = toggleTrending;
module.exports.toggleBestSeller = toggleBestSeller;
module.exports.updateProductStatus = updateProductStatus;
module.exports.updateStock = updateStock;
module.exports.deleteProductImage = deleteProductImage;
module.exports.exportProductsExcel = exportProductsExcel;
module.exports.getVariantOptions = getVariantOptions;
module.exports.createVariantOption = createVariantOption;
module.exports.updateVariantOption = updateVariantOption;
module.exports.deleteVariantOption = deleteVariantOption;
module.exports.generateVariantCombinations = generateVariantCombinations;
module.exports.updateVariant = updateVariant;
module.exports.deleteVariant = deleteVariant;
module.exports.getProductSeo = getProductSeo;
module.exports.updateProductSeo = updateProductSeo;
