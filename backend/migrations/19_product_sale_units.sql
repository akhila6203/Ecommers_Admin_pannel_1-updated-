USE lms;

-- ============================================================
-- 1. PRODUCTS TABLE
-- Add selling mode columns
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sale_mode
    ENUM('piece', 'size', 'meter')
    NOT NULL DEFAULT 'piece'
    AFTER product_type,

  ADD COLUMN IF NOT EXISTS unit_name
    VARCHAR(30)
    NOT NULL DEFAULT 'piece'
    AFTER sale_mode,

  ADD COLUMN IF NOT EXISTS minimum_quantity
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00
    AFTER unit_name,

  ADD COLUMN IF NOT EXISTS quantity_step
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00
    AFTER minimum_quantity;


-- ============================================================
-- 2. PRODUCTS STOCK COLUMNS
-- ============================================================

ALTER TABLE products
  MODIFY COLUMN stock
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00,

  MODIFY COLUMN low_stock_threshold
    DECIMAL(12,2)
    NOT NULL DEFAULT 5.00,

  MODIFY COLUMN total_sales
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00;


-- ============================================================
-- 3. PRODUCT VARIANTS STOCK
-- ============================================================

ALTER TABLE product_variants
  MODIFY COLUMN stock
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00;


-- ============================================================
-- 4. INVENTORY TABLE
-- ============================================================

ALTER TABLE inventory
  MODIFY COLUMN quantity
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00,

  MODIFY COLUMN reserved_quantity
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00,

  MODIFY COLUMN available_quantity
    DECIMAL(12,2)
    NOT NULL DEFAULT 0.00,

  MODIFY COLUMN low_stock_threshold
    DECIMAL(12,2)
    NOT NULL DEFAULT 5.00;


-- ============================================================
-- 5. INVENTORY LOGS TABLE
-- ============================================================

ALTER TABLE inventory_logs
  MODIFY COLUMN quantity
    DECIMAL(12,2)
    NOT NULL,

  MODIFY COLUMN previous_quantity
    DECIMAL(12,2)
    DEFAULT NULL,

  MODIFY COLUMN new_quantity
    DECIMAL(12,2)
    DEFAULT NULL;


-- ============================================================
-- 6. CART QUANTITY
-- ============================================================

ALTER TABLE cart
  MODIFY COLUMN quantity
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00;


-- ============================================================
-- 7. ORDER ITEMS QUANTITY
-- ============================================================

ALTER TABLE order_items
  MODIFY COLUMN quantity
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00;


-- ============================================================
-- 8. KEEP OLD PRODUCTS WORKING AS PIECE PRODUCTS
-- ============================================================

UPDATE products
SET
  sale_mode = 'piece',
  unit_name = 'piece',
  minimum_quantity = 1.00,
  quantity_step = 1.00
WHERE sale_mode IS NULL
   OR sale_mode = '';


   USE lms;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS sale_mode
    ENUM('piece', 'size', 'meter')
    NOT NULL DEFAULT 'piece'
    AFTER variant_info,

  ADD COLUMN IF NOT EXISTS unit_name
    VARCHAR(30)
    NOT NULL DEFAULT 'piece'
    AFTER sale_mode,

  ADD COLUMN IF NOT EXISTS minimum_quantity
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00
    AFTER unit_name,

  ADD COLUMN IF NOT EXISTS quantity_step
    DECIMAL(10,2)
    NOT NULL DEFAULT 1.00
    AFTER minimum_quantity;