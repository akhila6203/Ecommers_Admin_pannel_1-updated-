/**
 * LM Shopping Mall — API Health Audit Script
 * Run: node scripts/qa-audit.js
 */
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN = { email: "admin@lms.com", password: "admin123" };

const results = { passed: [], failed: [], warnings: [] };

async function request(method, url, { token, body, expectStatus } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { _raw: "non-json response" };
  }
  return { status: res.status, json, ok: res.ok };
}

function assert(name, condition, detail = "") {
  if (condition) {
    results.passed.push({ name, detail });
    console.log(`  ✓ ${name}`);
  } else {
    results.failed.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function warn(name, detail) {
  results.warnings.push({ name, detail });
  console.log(`  ⚠ ${name} — ${detail}`);
}

function hasApiShape(json) {
  return typeof json === "object" && json !== null && "success" in json && "message" in json;
}

async function getDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "lm_shopping_mall",
    port: parseInt(process.env.DB_PORT, 10) || 3306,
  });
}

async function run() {
  console.log("\n=== LM API Health Audit ===\n");
  console.log(`Base URL: ${BASE}\n`);

  // --- Health ---
  console.log("[Health]");
  const health = await request("GET", "/health");
  assert("GET /api/health returns 200", health.status === 200);
  assert("GET /api/health has success:true", health.json.success === true);

  // --- Auth: no token ---
  console.log("\n[Authentication]");
  const noAuth = await request("GET", "/dashboard/stats");
  assert("Protected route without token → 401", noAuth.status === 401);
  assert("401 response has success:false", noAuth.json.success === false);

  const badToken = await request("GET", "/dashboard/stats", { token: "invalid.token.here" });
  assert("Invalid token → 401", badToken.status === 401);

  // --- Login ---
  const login = await request("POST", "/auth/login", { body: ADMIN });
  assert("POST /auth/login success", login.status === 200 && login.json.success);
  const token = login.json.data?.token;
  assert("Login returns JWT token", !!token);

  const badLogin = await request("POST", "/auth/login", { body: { email: "x@x.com", password: "wrong" } });
  assert("Bad credentials → 401 or 400", [400, 401].includes(badLogin.status));

  // --- Profile ---
  const profile = await request("GET", "/auth/profile", { token });
  assert("GET /auth/profile", profile.status === 200 && profile.json.success);
  assert("Profile response shape", hasApiShape(profile.json) && profile.json.data?.email);

  // --- Public endpoints ---
  console.log("\n[Public Endpoints]");
  const publicEndpoints = [
    ["GET", "/categories/hierarchy"],
    ["GET", "/products?limit=1"],
    ["GET", "/banners"],
    ["GET", "/settings/public"],
    ["GET", "/content/about"],
    ["POST", "/coupons/validate", { body: { code: "INVALID", orderTotal: 100 } }],
  ];
  for (const [method, url, opts = {}] of publicEndpoints) {
    const r = await request(method, url, opts);
    assert(`${method} ${url}`, r.status < 500 && hasApiShape(r.json), `status=${r.status}`);
  }

  // --- Protected read endpoints ---
  console.log("\n[Protected Read Endpoints]");
  const protectedGets = [
    "/dashboard/stats",
    "/categories",
    "/products?limit=5",
    "/orders?limit=5",
    "/customers?limit=5",
    "/coupons",
    "/offers",
    "/collections",
    "/reviews?limit=5",
    "/settings",
    "/settings/store-information",
    "/settings/about-us",
    "/settings/privacy-policy",
    "/settings/terms-conditions",
    "/settings/contact-page",
    "/notifications",
    "/media?limit=5",
    "/admin",
    "/reports/summary",
  ];
  for (const url of protectedGets) {
    const r = await request("GET", url, { token });
    assert(`GET ${url}`, r.status === 200 && r.json.success === true, `status=${r.status} msg=${r.json.message}`);
  }

  // --- CRUD: Category ---
  console.log("\n[CRUD: Categories]");
  const catName = `QA-Cat-${Date.now()}`;
  const createCat = await request("POST", "/categories", { token, body: { name: catName } });
  assert("Create category", createCat.status === 201 || createCat.status === 200, `status=${createCat.status}`);
  const catId = createCat.json.data?.id;

  if (catId) {
    const getCat = await request("GET", `/categories/${catId}`);
    assert("Read category", getCat.status === 200 && getCat.json.data?.name === catName);

    const updateCat = await request("PUT", `/categories/${catId}`, { token, body: { name: `${catName}-Updated` } });
    assert("Update category", updateCat.status === 200);

    let dbMatch = false;
    try {
      const db = await getDb();
      const [rows] = await db.execute("SELECT name FROM categories WHERE id = ?", [catId]);
      dbMatch = rows[0]?.name === `${catName}-Updated`;
      await db.end();
    } catch (e) {
      warn("DB consistency check (category)", e.message);
    }
    assert("DB consistency: category name updated", dbMatch);

    const delCat = await request("DELETE", `/categories/${catId}`, { token });
    assert("Delete category", delCat.status === 200);
  }

  // --- CRUD: Coupon ---
  console.log("\n[CRUD: Coupons]");
  const couponCode = `QA${Date.now()}`.slice(0, 12);
  const createCoupon = await request("POST", "/coupons", {
    token,
    body: {
      code: couponCode,
      type: "percentage",
      value: 10,
      minimum_order_amount: 0,
      maximum_discount: 100,
      usage_limit: 10,
      per_user_limit: 1,
      start_date: "2026-01-01",
      expiry_date: "2027-12-31",
      status: "active",
      description: "QA test coupon",
      is_for_new_customers: 0,
    },
  });
  assert("Create coupon", createCoupon.status === 201 || createCoupon.status === 200, createCoupon.json.message);
  const couponId = createCoupon.json.data?.id;

  if (couponId) {
    const updateCoupon = await request("PUT", `/coupons/${couponId}`, {
      token,
      body: { value: 15, type: "percentage", code: couponCode, status: "active" },
    });
    assert("Update coupon", updateCoupon.status === 200, updateCoupon.json.message);

    const delCoupon = await request("DELETE", `/coupons/${couponId}`, { token });
    assert("Delete coupon", delCoupon.status === 200);
  }

  // --- CRUD: Settings store-information ---
  console.log("\n[CRUD: Store Information]");
  const storePayload = {
    companyName: "QA Test Co",
    contactEmail: "qa@test.com",
    websiteUrl: "https://qa.test",
    gstin: "",
    pan: "",
    cin: "",
    gstStateCode: "36",
    gstRegistrationType: "Regular",
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    youtubeUrl: "",
    whatsappNumber: "",
    whatsappMessage: "",
    storeAddress: "123 QA St",
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    postalCode: "500001",
    storeLogo: "",
    storeBanner: "",
  };
  const putStore = await request("PUT", "/settings/store-information", { token, body: storePayload });
  assert("Update store information", putStore.status === 200);

  let storeDbOk = false;
  try {
    const db = await getDb();
    const [rows] = await db.execute(
      "SELECT value FROM settings WHERE group_name = 'store_information' AND key_name = 'companyName'"
    );
    storeDbOk = rows[0]?.value === "QA Test Co";
    await db.end();
  } catch (e) {
    warn("DB consistency (store_information)", e.message);
  }
  assert("DB consistency: store_information.companyName", storeDbOk);

  const getStore = await request("GET", "/settings/store-information", { token });
  assert("Read store information", getStore.json.data?.companyName === "QA Test Co");

  // --- CRUD: Privacy Policy ---
  console.log("\n[CRUD: Privacy Policy]");
  const privacyPayload = { title: "Privacy QA", content: "<p>Test content</p>" };
  const putPrivacy = await request("PUT", "/settings/privacy-policy", { token, body: privacyPayload });
  assert("Update privacy policy", putPrivacy.status === 200);
  const getPrivacy = await request("GET", "/settings/privacy-policy", { token });
  assert("Read privacy policy", getPrivacy.json.data?.title === "Privacy QA");

  // --- 404 handler ---
  console.log("\n[Error Handling]");
  const notFound = await request("GET", "/nonexistent-route-xyz");
  assert("404 returns JSON error", notFound.status === 404 && notFound.json.success === false);
  assert("404 no HTML/stack in message", !String(notFound.json.message).includes("<html>"));

  // --- Role check (staff on super_admin route) - skip if only super_admin exists ---
  console.log("\n[Authorization]");
  warn("Role-based tests", "Manual verification needed for manager/staff roles");

  // --- Summary ---
  console.log("\n=== SUMMARY ===");
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Warnings: ${results.warnings.length}`);

  const total = results.passed.length + results.failed.length;
  const coverage = total ? ((results.passed.length / total) * 100).toFixed(1) : 0;
  console.log(`Pass rate: ${coverage}%`);

  if (results.failed.length) {
    console.log("\nFailed tests:");
    results.failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Audit script error:", err.message);
  process.exit(1);
});
