const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");
const { testConnection } = require("./config/db");
const { runPendingMigrations } = require("./config/runMigrations");
const { storeMiddleware } = require("./middleware/storeMiddleware");
const logger = require("./config/logger");
const { apiLimiter } = require("./middleware/rateLimiterMiddleware");
const { sanitizeMiddleware } = require("./helpers/sanitizeHelper");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");
// Import Routes
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const customerRoutes = require("./routes/customerRoutes");
const couponRoutes = require("./routes/couponRoutes");
const offerRoutes = require("./routes/offerRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const bannerVideoRoutes = require("./routes/bannerVideoRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
const settingRoutes = require("./routes/settingRoutes");
const contentRoutes = require("./routes/contentRoutes");
const reportRoutes = require("./routes/reportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const adminRoutes = require("./routes/adminRoutes");
const storeRoutes = require("./routes/storeRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const storefrontAuthRoutes = require("./routes/storefrontAuthRoutes");
const storefrontOrderRoutes = require("./routes/storefrontOrderRoutes");
const storefrontPaymentRoutes = require("./routes/storefrontPaymentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
dotenv.config();

console.log("SERVER FILE LOADED");



const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

// CORS Configuration — allow multiple frontend origins
const allowedOrigins = [
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-Store-Id",
  "X-Cart-Session-Id",
],

  // allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Store-Id"],
}));

// Body Parsers
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Global rate limiting — all environments (higher limit in development)
app.use(apiLimiter);
app.use(sanitizeMiddleware);
app.use(storeMiddleware);

// Static Files (Uploads)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/banner-videos", bannerVideoRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/storefront/auth", storefrontAuthRoutes);
app.use("/api/storefront/orders", storefrontOrderRoutes);
app.use("/api/storefront/payments", storefrontPaymentRoutes);
app.use("/api/webhooks", webhookRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LM Shopping Mall API Running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Root Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LM Shopping Mall Backend API",
    version: "1.0.0",
    docs: "/api/docs",
  });
});

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// ========== GLOBAL UNHANDLED REJECTION HANDLER ==========
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Log but do NOT exit — let the server continue running
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  // Give the logger time to flush, then exit gracefully
  setTimeout(() => process.exit(1), 1000);
});

// ========== START SERVER ==========
async function startServer() {
  console.log("Starting LM Shopping Mall Backend...");
  console.log(`Port: ${PORT}, Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("Connecting to MySQL...");

  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error("ERROR: Could not connect to MySQL database. Check your .env configuration.");
    logger.error("Server startup failed — database connection could not be established");
    process.exit(1);
  }

  console.log("MySQL database connected successfully");

  try {
    await runPendingMigrations();
    console.log("Database migrations checked");
  } catch (migrationError) {
    console.error("ERROR: Database migration failed:", migrationError.message);
    logger.error("Server startup failed — migration error", migrationError);
    process.exit(1);
  }

  app.listen(PORT, () => {
    const startupMsg = `Server running on port ${PORT}`;
    console.log(startupMsg);
    logger.info(`✓ ${process.env.APP_NAME || "LM Shopping Mall"} backend running on port ${PORT}`);
    logger.info(`  Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`  Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
    logger.info(`  API Base: http://localhost:${PORT}/api`);
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      const msg = `Port ${PORT} is already in use. Please stop the other process or change PORT in .env`;
      console.error(`ERROR: ${msg}`);
      logger.error(msg);
    } else {
      console.error("ERROR: Failed to start server:", err.message);
      logger.error("Failed to start server:", err);
    }
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = app;