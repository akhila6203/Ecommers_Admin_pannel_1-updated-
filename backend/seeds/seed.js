const { query, testConnection } = require("../src/config/db");
const { hashPassword } = require("../src/helpers/passwordHelper");
const { generateSlug } = require("../src/helpers/slugHelper");
const logger = require("../src/config/logger");
async function seed() {
  console.log("🌱 Seeding LM Shopping Mall database...\n");

  const connected = await testConnection();
  if (!connected) {
    console.error("❌ Database connection failed. Check your .env configuration.");
    process.exit(1);
  }

  try {
    // 1. Clear existing data in reverse order
    console.log("📦 Clearing existing data...");
    await query("SET FOREIGN_KEY_CHECKS = 0");
    const tables = [
      "inventory_logs", "inventory", "order_notes", "order_timeline", "order_items",
      "orders", "cart", "wishlists", "reviews", "collection_products", "collections",
      "product_variants", "product_images", "products", "child_categories",
      "sub_categories", "categories", "coupon_usage", "coupons", "offers", "banners",
      "notifications", "email_templates", "settings", "activity_logs", "audit_logs",
      "media", "customer_addresses", "customers", "password_resets", "refresh_tokens",
      "role_permissions", "permissions", "admins", "roles",
    ];
    for (const table of tables) {
      await query(`TRUNCATE TABLE ${table}`);
    }
    await query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("✅ Existing data cleared");

    // 2. Roles
    console.log("\n👥 Creating roles...");
    await query(`INSERT INTO roles (name, slug, description) VALUES
      ('Super Admin', 'super-admin', 'Full access to all features'),
      ('Admin', 'admin', 'Administrative access with limited controls'),
      ('Manager', 'manager', 'Can manage products, orders, and customers'),
      ('Staff', 'staff', 'Limited staff access')`);
    console.log("✅ 4 roles created");

    // 3. Admin
    console.log("\n👤 Creating admin user...");
    const hashedPassword = await hashPassword("admin123");
    await query(
      "INSERT INTO admins (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
      ["Super Admin", "admin@lms.com", hashedPassword, "super_admin", "active"]
    );
    console.log("✅ Admin created: admin@lms.com / admin123");

    // 4. Categories
    console.log("\n📂 Creating categories...");
    const catNames = ["Sarees", "Kurtis", "Lehengas", "Dupattas", "Accessories", "Blouses", "Gowns", "Fusion Wear"];
    const catIds = {};
    for (const name of catNames) {
      const slug = generateSlug(name);
      const result = await query(
        "INSERT INTO categories (name, slug, description, status, sort_order) VALUES (?, ?, ?, 'active', ?)",
        [name, slug, `Premium ${name} collection`, catNames.indexOf(name)]
      );
      catIds[name] = result.insertId;
    }
    console.log(`✅ ${catNames.length} categories created`);

    // 5. Sub-categories
    console.log("\n📁 Creating sub-categories...");
    const subCategories = [
      ["Sarees", ["Silk Sarees", "Cotton Sarees", "Banarasi Sarees", "Kanjivaram Sarees", "Designer Sarees", "Daily Wear Sarees"]],
      ["Kurtis", ["Anarkali Kurtis", "Straight Cut Kurtis", "A-Line Kurtis", "Pakistani Kurtis", "Cotton Kurtis"]],
      ["Lehengas", ["Bridal Lehengas", "Party Wear Lehengas", "Designer Lehengas", "Simple Lehengas"]],
      ["Accessories", ["Jewelry Sets", "Bangles", "Earrings", "Necklaces", "Bags", "Footwear"]],
      ["Blouses", ["Designer Blouses", "Silk Blouses", "Cotton Blouses", "Embroidered Blouses"]],
    ];

    const subCatIds = {};
    for (const [parent, children] of subCategories) {
      for (const child of children) {
        const slug = generateSlug(child);
        const result = await query(
          "INSERT INTO sub_categories (main_category_id, name, slug, description, status) VALUES (?, ?, ?, ?, 'active')",
          [catIds[parent], child, slug, `${child} collection`]
        );
        subCatIds[child] = result.insertId;
      }
    }
    console.log("✅ Sub-categories created");

    // 6. Products
    console.log("\n📦 Creating sample products...");
    const products = [
      { name: "Traditional Banarasi Silk Saree", cat: "Sarees", subCat: "Banarasi Sarees", price: 5000, offer: 4200, stock: 50, featured: 1, trending: 1, bestseller: 1 },
      { name: "Handloom Cotton Saree", cat: "Sarees", subCat: "Cotton Sarees", price: 2000, offer: 1500, stock: 100, featured: 1 },
      { name: "Designer Kanjivaram Silk Saree", cat: "Sarees", subCat: "Kanjivaram Sarees", price: 8000, offer: 6500, stock: 30, trending: 1, bestseller: 1 },
      { name: "Elegant Anarkali Kurti", cat: "Kurtis", subCat: "Anarkali Kurtis", price: 2500, offer: 1800, stock: 80, featured: 1, trending: 1 },
      { name: "Cotton Straight Cut Kurti", cat: "Kurtis", subCat: "Straight Cut Kurtis", price: 1200, offer: 899, stock: 150, bestseller: 1 },
      { name: "Designer A-Line Kurti Set", cat: "Kurtis", subCat: "A-Line Kurtis", price: 3000, offer: 2200, stock: 45, featured: 1 },
      { name: "Premium Bridal Lehenga", cat: "Lehengas", subCat: "Bridal Lehengas", price: 25000, offer: 18999, stock: 10, featured: 1, trending: 1, bestseller: 1 },
      { name: "Party Wear Lehenga Choli", cat: "Lehengas", subCat: "Party Wear Lehengas", price: 15000, offer: 11000, stock: 20, trending: 1 },
      { name: "Traditional Silk Dupatta", cat: "Dupattas", subCat: null, price: 1500, offer: 999, stock: 100 },
      { name: "Designer Jewelry Set", cat: "Accessories", subCat: "Jewelry Sets", price: 3500, offer: 2500, stock: 60, trending: 1 },
      { name: "Embroidered Designer Blouse", cat: "Blouses", subCat: "Designer Blouses", price: 2500, offer: 1800, stock: 40 },
      { name: "Silk Designer Blouse Piece", cat: "Blouses", subCat: "Silk Blouses", price: 1800, offer: 1200, stock: 55 },
    ];

    for (const p of products) {
      const slug = generateSlug(p.name);
      const discountPer = Math.round((1 - p.offer / p.price) * 100);
      const result = await query(
        `INSERT INTO products (name, slug, sku, category_id, sub_category_id, price, offer_price, discount_percentage, stock, stock_status, short_description, status, is_featured, is_trending, is_best_seller, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 1)`,
        [p.name, slug, `PRO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, catIds[p.cat], p.subCat ? subCatIds[p.subCat] : null, p.price, p.offer, discountPer, p.stock, p.stock > 5 ? "in_stock" : "low_stock", `Beautiful ${p.name.toLowerCase()} - perfect for any occasion`, p.featured || 0, p.trending || 0, p.bestseller || 0]
      );

      // Add inventory record
      await query("INSERT INTO inventory (product_id, quantity, available_quantity, low_stock_threshold) VALUES (?, ?, ?, 5)", [result.insertId, p.stock, p.stock]);
    }
    console.log(`✅ ${products.length} products created`);

    // 7. Customers
    console.log("\n👥 Creating sample customers...");
    const customerPassword = await hashPassword("customer123");
    const customers = [
      { first: "Priya", last: "Sharma", email: "priya@email.com", phone: "9876543210" },
      { first: "Ananya", last: "Verma", email: "ananya@email.com", phone: "9876543211" },
      { first: "Riya", last: "Patel", email: "riya@email.com", phone: "9876543212" },
      { first: "Neha", last: "Singh", email: "neha@email.com", phone: "9876543213" },
      { first: "Kavya", last: "Reddy", email: "kavya@email.com", phone: "9876543214" },
    ];

    for (const c of customers) {
      await query(
        "INSERT INTO customers (first_name, last_name, email, password, phone, status) VALUES (?, ?, ?, ?, ?, 'active')",
        [c.first, c.last, c.email, customerPassword, c.phone]
      );
    }
    console.log(`✅ ${customers.length} customers created`);

    // 8. Orders
    console.log("\n📋 Creating sample orders...");
    const orderStatuses = ["pending", "confirmed", "packed", "shipped", "delivered"];
    const paymentMethods = ["cod", "online", "razorpay"];
    const paymentStatuses = ["pending", "paid"];

    for (let i = 1; i <= 5; i++) {
      const orderNumber = `LM-${Date.now()}-${i}`;
      const customerIdx = (i - 1) % customers.length;
      const status = orderStatuses[Math.min(i - 1, orderStatuses.length - 1)];
      const subtotal = 3000 + (i * 1000);
      const shippingCharge = 49;
      const totalAmount = subtotal + shippingCharge;

      const result = await query(
        `INSERT INTO orders (order_number, customer_id, email, phone, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, subtotal, shipping_charge, total_amount, payment_method, payment_status, is_cod, order_status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [orderNumber, (i - 1) % customers.length + 1, customers[customerIdx].email, customers[customerIdx].phone,
         customers[customerIdx].first + " " + customers[customerIdx].last, customers[customerIdx].phone,
         "123, Main Street", "Mumbai", "Maharashtra", "400001", subtotal, shippingCharge, totalAmount,
         paymentMethods[i % paymentMethods.length], paymentStatuses[i % paymentStatuses.length],
         i % 2 === 0 ? 1 : 0, status]
      );

      // Add order item
      const productIdx = (i - 1) % products.length;
      const product = products[productIdx];
      await query(
        "INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, price, total_price) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [result.insertId, productIdx + 1, product.name, `SKU-${productIdx + 1}`, product.offer, product.offer]
      );

      // Add timeline
      await query("INSERT INTO order_timeline (order_id, status, note) VALUES (?, ?, ?)",
        [result.insertId, "pending", "Order placed"]);
    }
    console.log("✅ 5 sample orders created");

    // 9. Coupons
    console.log("\n🎫 Creating coupons...");
    await query(`INSERT INTO coupons (code, type, value, minimum_order_amount, maximum_discount, usage_limit, expiry_date, status) VALUES
      ('WELCOME10', 'percentage', 10, 500, 500, 100, '2027-12-31', 'active'),
      ('FESTIVE50', 'flat', 500, 2000, 500, 50, '2026-12-31', 'active'),
      ('FREESHIP', 'percentage', 100, 499, 49, 200, '2027-06-30', 'active'),
      ('NEWUSER', 'percentage', 20, 1000, 1000, 50, '2026-12-31', 'active')`);
    console.log("✅ 4 coupons created");

    // 10. Banners
    console.log("\n🎨 Creating banners...");
    await query(`INSERT INTO banners (title, subtitle, description, image, type, status, sort_order) VALUES
      ('Summer Collection', 'Fresh arrivals for the season', 'Explore our new summer collection', 'placeholder.svg', 'homepage', 'active', 1),
      ('Festival Sale', 'Up to 50% off on ethnic wear', 'Celebrate with style', 'placeholder.svg', 'slider', 'active', 2),
      ('New Arrivals', 'Check out the latest trends', 'Be the first to wear them', 'placeholder.svg', 'promotional', 'active', 3)`);
    console.log("✅ 3 banners created");

    // 11. Settings
    console.log("\n⚙️ Creating default settings...");
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
        ('smtp', 'smtp_host', 'smtp.gmail.com', 'text'),
        ('smtp', 'smtp_port', '587', 'text'),
        ('payment', 'cod_enabled', 'true', 'boolean'),
        ('payment', 'online_payment_enabled', 'true', 'boolean'),
        ('shipping', 'free_shipping_minimum', '499', 'text'),
        ('shipping', 'shipping_charge', '49', 'text')`);
    }
    console.log("✅ Default settings created");

    console.log("\n🎉 Seeding completed successfully!");
    console.log("\n📋 Login Credentials:");
    console.log("   Admin: admin@lms.com / admin123");
    console.log("   Customer: priya@email.com / customer123");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
}

seed();