const fs = require("fs");
const path = require("path");
const dumpPath = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/c-Users-KUMMARI-AKHILA-Ecommerce-admin/agent-tools/4e974493-200c-4dad-b859-a9561d61abc9.txt"
);

const dump = fs.readFileSync(dumpPath, "utf8");

const tableRegex = /CREATE TABLE `([^`]+)` \([\s\S]*?\) ENGINE=InnoDB[^;]*;/g;
const tables = {};
let m;
while ((m = tableRegex.exec(dump)) !== null) {
  let sql = m[0];
  sql = sql.replace(/^CREATE TABLE `/, "CREATE TABLE IF NOT EXISTS `");
  sql = sql.replace(/ AUTO_INCREMENT=\d+/g, "");
  tables[m[1]] = sql;
}

const groups = {
  "00_init.sql": [],
  "01_stores.sql": ["stores"],
  "02_auth.sql": ["roles", "permissions", "role_permissions", "admins", "password_resets", "refresh_tokens"],
  "03_categories.sql": ["categories", "sub_categories", "child_categories"],
  "04_products.sql": ["products", "product_images", "product_variants", "product_variant_options", "product_seo", "inventory", "inventory_logs"],
  "05_collections.sql": ["collections", "collection_products"],
  "06_customers.sql": ["customers", "customer_addresses", "cart", "wishlists", "reviews"],
  "07_orders.sql": ["orders", "order_items", "order_timeline", "order_notes"],
  "08_coupons.sql": ["coupons", "coupon_usage"],
  "09_offers_banners.sql": ["offers", "banners"],
  "10_content_settings.sql": ["content_pages", "settings", "store_settings", "integration_settings", "settings_integrations"],
  "11_media_notifications.sql": ["media", "notifications", "email_templates"],
  "12_logs.sql": ["activity_logs", "audit_logs"],
};

const headers = {
  "00_init.sql": "Database Init",
  "01_stores.sql": "Stores (multi-website / store_id)",
  "02_auth.sql": "Auth: roles, admins, tokens",
  "03_categories.sql": "Categories (3-level hierarchy)",
  "04_products.sql": "Products, variants, SEO, inventory",
  "05_collections.sql": "Collections",
  "06_customers.sql": "Customers, addresses, cart, wishlist, reviews",
  "07_orders.sql": "Orders",
  "08_coupons.sql": "Coupons & usage",
  "09_offers_banners.sql": "Offers & Banners",
  "10_content_settings.sql": "Content pages & settings",
  "11_media_notifications.sql": "Media & notifications",
  "12_logs.sql": "Activity & audit logs",
};

const migrationsDir = path.join(__dirname, "../migrations");

for (const [file, tableList] of Object.entries(groups)) {
  if (file === "00_init.sql") {
    fs.writeFileSync(
      path.join(migrationsDir, file),
      `-- ============================================================
-- LM Shopping Mall - ${headers[file]}
-- Database: lms (matches XAMPP MariaDB schema)
-- ============================================================

CREATE DATABASE IF NOT EXISTS lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lms;
`
    );
    continue;
  }

  let content = `-- ============================================================
-- LM Shopping Mall - ${headers[file]}
-- Database: lms (matches XAMPP MariaDB schema)
-- ============================================================

USE lms;

`;

  for (const t of tableList) {
    if (!tables[t]) {
      console.error("Missing table:", t);
      process.exit(1);
    }
    content += `${tables[t]}\n\n`;
  }

  if (file === "01_stores.sql") {
    content += `INSERT INTO stores (id, name, slug, status)
VALUES (1, 'LM Shopping Mall', 'lm-shopping-mall', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), status = VALUES(status);
`;
  }

  if (file === "10_content_settings.sql") {
    content += `INSERT INTO store_settings (store_id, company_name)
SELECT 1, 'LM Shopping Mall' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM store_settings WHERE store_id = 1);

INSERT INTO integration_settings (store_id)
SELECT 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM integration_settings WHERE store_id = 1);

INSERT IGNORE INTO content_pages (store_id, page_key, title, content, status) VALUES
  (1, 'about', 'About Us', '', 'active'),
  (1, 'contact', 'Contact Us', '{}', 'active'),
  (1, 'privacy-policy', 'Privacy Policy', '', 'active'),
  (1, 'terms-conditions', 'Terms & Conditions', '', 'active'),
  (1, 'shipping-policy', 'Shipping Policy', '', 'active'),
  (1, 'refund-policy', 'Refund Policy', '', 'active');
`;
  }

  fs.writeFileSync(path.join(migrationsDir, file), content);
}

console.log("Generated migration files:", Object.keys(groups).length);
console.log("Tables from XAMPP dump:", Object.keys(tables).length);
