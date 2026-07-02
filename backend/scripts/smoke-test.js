const fs = require("fs");
const path = require("path");
const base = process.env.API_BASE || "http://localhost:5000/api";

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login() {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@lms.com", password: "admin123" }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.message || "Login failed");
  return body.data.token;
}

async function jsonRequest(token, method, path, payload) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function makePngBuffer() {
  // 1x1 transparent PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

async function testBannerUpload(token) {
  const png = makePngBuffer();
  const form = new FormData();
  form.append("title", `Smoke Banner ${Date.now()}`);
  form.append("status", "active");
  form.append("type", "homepage");
  form.append("image", new Blob([png], { type: "image/png" }), "smoke-banner.png");

  const createRes = await fetch(`${base}/banners`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const createBody = await createRes.json();
  if (!createRes.ok || !createBody.success || !createBody.data?.id) {
    fail("Banner upload", createBody.message || createRes.statusText);
    return;
  }

  const bannerId = createBody.data.id;
  const imagePath = createBody.data.image;
  ok("Banner upload", `id=${bannerId}, image=${imagePath}`);

  const imageUrl = imagePath.startsWith("http")
    ? imagePath
    : `http://localhost:5000/${imagePath.replace(/^\/+/, "")}`;
  const imgRes = await fetch(imageUrl);
  if (imgRes.ok) ok("Banner image URL reachable", imageUrl);
  else fail("Banner image URL reachable", `${imgRes.status} ${imageUrl}`);

  const updateForm = new FormData();
  updateForm.append("title", `Smoke Banner Updated ${Date.now()}`);
  const updateRes = await fetch(`${base}/banners/${bannerId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: updateForm,
  });
  const updateBody = await updateRes.json();
  if (updateRes.ok && updateBody.success) ok("Banner update");
  else fail("Banner update", updateBody.message);

  const delRes = await fetch(`${base}/banners/${bannerId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const delBody = await delRes.json();
  if (delRes.ok && delBody.success) ok("Banner delete");
  else fail("Banner delete", delBody.message);
}

async function testCouponEdit(token) {
  const code = `SMOKE${Date.now().toString().slice(-6)}`;
  const { res: createRes, body: createBody } = await jsonRequest(token, "POST", "/coupons", {
    code,
    type: "percentage",
    value: 15,
    start_date: "2026-01-01",
    expiry_date: "2026-12-31",
    status: "active",
    minimum_order_amount: 100,
    usage_limit: 50,
  });

  if (!createRes.ok || !createBody.success) {
    fail("Coupon create", createBody.message);
    return;
  }
  const id = createBody.data.id;
  ok("Coupon create", code);

  const getRes = await fetch(`${base}/coupons/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getBody = await getRes.json();
  if (getRes.ok && getBody.data?.code === code && Number(getBody.data?.value) === 15) {
    ok("Coupon edit load (GET by id)", `value=${getBody.data.value}`);
  } else {
    fail("Coupon edit load (GET by id)", getBody.message);
  }

  const { res: updateRes, body: updateBody } = await jsonRequest(token, "PUT", `/coupons/${id}`, {
    code,
    type: "percentage",
    value: 20,
    start_date: "2026-02-01",
    expiry_date: "2026-11-30",
    status: "active",
  });
  if (updateRes.ok && updateBody.success) ok("Coupon update");
  else fail("Coupon update", updateBody.message);

  const verifyRes = await fetch(`${base}/coupons/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verifyBody = await verifyRes.json();
  if (verifyRes.ok && Number(verifyBody.data?.value) === 20 && Number(verifyBody.data?.usage_limit) === 50) {
    ok("Coupon update preserved usage_limit", `usage_limit=${verifyBody.data.usage_limit}`);
  } else {
    fail("Coupon update preserved usage_limit");
  }

  const { res: delRes, body: delBody } = await jsonRequest(token, "DELETE", `/coupons/${id}`);
  if (delRes.ok && delBody.success) ok("Coupon delete");
  else fail("Coupon delete", delBody.message);
}

async function testProductEdit(token) {
  const listRes = await fetch(`${base}/products?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listBody = await listRes.json();
  const product = listBody.data?.[0];
  if (!product?.id) {
    fail("Product edit", "No product found in database");
    return;
  }

  const getRes = await fetch(`${base}/products/${product.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getBody = await getRes.json();
  if (!getRes.ok || !getBody.success) {
    fail("Product edit load", getBody.message);
    return;
  }
  ok("Product edit load", `id=${product.id}, name=${getBody.data.name}`);

  const newName = `${getBody.data.name} (smoke ${Date.now().toString().slice(-4)})`;
  const form = new FormData();
  form.append("name", newName);
  form.append("status", getBody.data.status || "active");
  if (getBody.data.category_id) form.append("category_id", String(getBody.data.category_id));
  if (getBody.data.sub_category_id) form.append("sub_category_id", String(getBody.data.sub_category_id));
  if (getBody.data.child_category_id) form.append("child_category_id", String(getBody.data.child_category_id));

  const updateRes = await fetch(`${base}/products/${product.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const updateBody = await updateRes.json();
  if (updateRes.ok && updateBody.success) ok("Product update", newName);
  else fail("Product update", updateBody.message || updateRes.statusText);

  // Revert name
  const revertForm = new FormData();
  revertForm.append("name", getBody.data.name);
  revertForm.append("status", getBody.data.status || "active");
  if (getBody.data.category_id) revertForm.append("category_id", String(getBody.data.category_id));
  if (getBody.data.sub_category_id) revertForm.append("sub_category_id", String(getBody.data.sub_category_id));
  if (getBody.data.child_category_id) revertForm.append("child_category_id", String(getBody.data.child_category_id));
  await fetch(`${base}/products/${product.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: revertForm,
  });
}

async function testConditionsTabs(token) {
  const tabs = [
    {
      key: "about",
      json: false,
      getPayload: () => {
        const form = new FormData();
        form.append("title", "About Us Smoke Test");
        form.append("content", "<p>Smoke test about content</p>");
        const png = makePngBuffer();
        form.append("image", new Blob([png], { type: "image/png" }), "about-smoke.png");
        return form;
      },
    },
    {
      key: "contact",
      payload: {
        title: "Contact Us",
        content: {
          storeName: "LM Smoke Store",
          email: "smoke@test.com",
          mobile: "+91 9876543210",
          alternateMobile: "+91 9998887776",
          address: "123 Test Street",
          googleMapsUrl: "https://maps.google.com/",
          whatsappNumber: "+91 9876543210",
        },
      },
    },
    {
      key: "privacy-policy",
      payload: { title: "Privacy Policy Smoke", content: "<p>Privacy smoke content</p>" },
    },
    {
      key: "terms-conditions",
      payload: { title: "Terms Smoke", content: "<p>Terms smoke content</p>" },
    },
    {
      key: "shipping-policy",
      payload: { title: "Shipping Smoke", content: "<p>Shipping smoke content</p>" },
    },
    {
      key: "refund-policy",
      payload: { title: "Refund Smoke", content: "<p>Refund smoke content</p>" },
    },
  ];

  for (const tab of tabs) {
    let res;
    if (tab.json === false) {
      res = await fetch(`${base}/content/${tab.key}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: tab.getPayload(),
      });
    } else {
      res = await fetch(`${base}/content/${tab.key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tab.payload),
      });
    }
    const body = await res.json();
    if (!res.ok || !body.success) {
      fail(`Conditions tab save: ${tab.key}`, body.message);
      continue;
    }

    const verify = await fetch(`${base}/content/${tab.key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const verifyBody = await verify.json();
    if (verify.ok && verifyBody.success) {
      ok(`Conditions tab save: ${tab.key}`, verifyBody.data?.title || tab.key);
    } else {
      fail(`Conditions tab verify: ${tab.key}`, verifyBody.message);
    }
  }
}

async function main() {
  console.log("=== LM Admin Smoke Test ===\n");
  const token = await login();
  ok("Login");

  console.log("\n--- Gallery / Banners ---");
  await testBannerUpload(token);

  console.log("\n--- Coupons ---");
  await testCouponEdit(token);

  console.log("\n--- Products ---");
  await testProductEdit(token);

  console.log("\n--- Conditions (6 tabs) ---");
  await testConditionsTabs(token);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  process.exit(1);
});
