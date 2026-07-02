const { query, testConnection } = require("../src/config/db");
const { hashPassword } = require("../src/helpers/passwordHelper");
const logger = require("../src/config/logger");
async function seed() {
  console.log("🌱 Seeding admin user...\n");

  const connected = await testConnection();
  if (!connected) {
    console.error("❌ Database connection failed. Check your .env configuration.");
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const existing = await query("SELECT id FROM admins WHERE email = ?", ["admin@lms.com"]);
    if (existing.length) {
      console.log("✅ Admin user already exists (admin@lms.com)");
    } else {
      const hashedPassword = await hashPassword("admin123");
      await query(
        "INSERT INTO admins (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
        ["Super Admin", "admin@lms.com", hashedPassword, "super_admin", "active"]
      );
      console.log("✅ Admin user created successfully");
      console.log("   Email: admin@lms.com");
      console.log("   Password: admin123");
    }

    // Ensure default roles exist
    await query(`INSERT IGNORE INTO roles (name, slug, description) VALUES
      ('Super Admin', 'super-admin', 'Full access to all features'),
      ('Admin', 'admin', 'Administrative access with limited controls'),
      ('Manager', 'manager', 'Can manage products, orders, and customers'),
      ('Staff', 'staff', 'Limited staff access')`);

    console.log("✅ Default roles ensured");

    // Ensure default settings exist
    const settingsExist = await query("SELECT COUNT(*) as count FROM settings");
    if (!settingsExist[0].count) {
      await query(`INSERT INTO settings (group_name, key_name, value, type) VALUES
        ('general', 'store_name', 'LM Shopping Mall', 'text'),
        ('general', 'store_email', 'info@lmshoppingmall.com', 'email'),
        ('general', 'store_phone', '+91 9876543210', 'text'),
        ('general', 'store_address', '123, Fashion Street, Mumbai - 400001', 'text'),
        ('general', 'store_currency', 'INR', 'text'),
        ('general', 'store_currency_symbol', '₹', 'text'),
        ('seo', 'meta_title', 'LM Shopping Mall - Premium Fashion Store', 'text'),
        ('seo', 'meta_description', 'Shop premium sarees, kurtis, lehengas and more', 'text'),
        ('seo', 'meta_keywords', 'sarees, kurtis, lehengas, fashion, ethnic wear', 'text'),
        ('smtp', 'smtp_host', 'smtp.gmail.com', 'text'),
        ('smtp', 'smtp_port', '587', 'text'),
        ('payment', 'cod_enabled', 'true', 'boolean'),
        ('payment', 'online_payment_enabled', 'true', 'boolean'),
        ('shipping', 'free_shipping_minimum', '499', 'text'),
        ('shipping', 'shipping_charge', '49', 'text'),
        ('invoice', 'invoice_prefix', 'INV', 'text'),
        ('invoice', 'invoice_footer', 'Thank you for shopping with LM Shopping Mall!', 'text')`);
      console.log("✅ Default settings inserted");
    } else {
      console.log("✅ Settings already exist");
    }

    console.log("\n🎉 Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
}

seed();