const { describe, it, expect, beforeAll } = require("@jest/globals");
const request = require("supertest");
const app = require("../src/server");
const ADMIN = { email: "admin@lms.com", password: "admin123" };
let token = "";
let refreshToken = "";

describe("LM Shopping Mall API", () => {
  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login").send(ADMIN);
    token = res.body.data?.token;
    refreshToken = res.body.data?.refreshToken;
  });

  describe("Authentication", () => {
    it("GET /api/health", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects protected route without token", async () => {
      const res = await request(app).get("/api/dashboard/stats");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("login with bad credentials fails", async () => {
      const res = await request(app).post("/api/auth/login").send({ email: "x@x.com", password: "wrong" });
      expect([400, 401]).toContain(res.status);
    });

    it("GET /api/auth/profile with valid token", async () => {
      const res = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(ADMIN.email);
    });

    it("POST /api/auth/refresh-token", async () => {
      const res = await request(app).post("/api/auth/refresh-token").send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeTruthy();
    });

    it("POST /api/auth/forgot-password returns success shape", async () => {
      const res = await request(app).post("/api/auth/forgot-password").send({ email: ADMIN.email });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Products", () => {
    it("GET /api/products paginated", async () => {
      const res = await request(app).get("/api/products?page=1&limit=5");
      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/products validation error without auth", async () => {
      const res = await request(app).post("/api/products").send({ name: "Test" });
      expect(res.status).toBe(401);
    });
  });

  describe("Orders", () => {
    it("GET /api/orders", async () => {
      const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("Customers", () => {
    it("GET /api/customers", async () => {
      const res = await request(app).get("/api/customers").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("DELETE /api/customers/999999 returns gracefully", async () => {
      const res = await request(app).delete("/api/customers/999999").set("Authorization", `Bearer ${token}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe("Collections", () => {
    it("GET /api/collections", async () => {
      const res = await request(app).get("/api/collections").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Settings", () => {
    it("PUT and GET store-information", async () => {
      const payload = { companyName: "Jest Test Co", contactEmail: "jest@test.com" };
      const put = await request(app).put("/api/settings/store-information").set("Authorization", `Bearer ${token}`).send(payload);
      expect(put.status).toBe(200);
      const get = await request(app).get("/api/settings/store-information").set("Authorization", `Bearer ${token}`);
      expect(get.body.data.companyName).toBe("Jest Test Co");
    });
  });

  describe("Categories CRUD", () => {
    let categoryId;
    it("creates, updates, deletes category", async () => {
      const name = `Jest-Cat-${Date.now()}`;
      const create = await request(app).post("/api/categories").set("Authorization", `Bearer ${token}`).send({ name });
      expect(create.status).toBeLessThan(300);
      categoryId = create.body.data.id;
      const update = await request(app).put(`/api/categories/${categoryId}`).set("Authorization", `Bearer ${token}`).send({ name: `${name}-Updated` });
      expect(update.status).toBe(200);
      const del = await request(app).delete(`/api/categories/${categoryId}`).set("Authorization", `Bearer ${token}`);
      expect(del.status).toBe(200);
    });
  });

  describe("Role-based access", () => {
    it("GET /api/admin requires super_admin or admin", async () => {
      const res = await request(app).get("/api/admin").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });
});
