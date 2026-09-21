import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWebhookAction } from "../app/utils/webhooks.server.js";

const secret = "test-app-secret";
const shop = "webhook-test.myshopify.com";

function request(topic, { body = "{}", key = secret, headers = {}, method = "POST" } = {}) {
  return new Request(`https://app.example.com/webhooks/${topic}`, {
    method,
    body,
    headers: {
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-Webhook-Id": "test-delivery-id",
      "X-Shopify-Hmac-Sha256": createHmac("sha256", key).update(body).digest("base64"),
      ...headers,
    },
  });
}

function fixture(topic, overrides = {}) {
  const logs = [];
  const action = createWebhookAction([topic], {
    env: { SHOPIFY_API_SECRET: secret, SHOPIFY_WEBHOOK_SECRET: "unrelated-shop-secret" },
    logger: Object.fromEntries(["info", "warn", "error"].map((level) => [level, (...args) => logs.push(args)])),
    ...overrides,
  });
  return { action, logs };
}

for (const topic of ["app/uninstalled", "shop/redact", "app/scopes_update", "customers/data_request", "customers/redact"]) {
  test(`${topic}: first delivery and duplicates succeed without database configuration`, async () => {
    const { action, logs } = fixture(topic);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await action({ request: request(topic) });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ok");
    }
    assert.equal(logs[0][1].webhookId, "test-delivery-id");
    assert.equal(logs[0][1].reason, "acknowledged");
  });
}

for (const topic of ["customers/data_request", "customers/redact"]) {
  test(`${topic}: verifies raw Unicode bytes without storing or logging customer data`, async () => {
    const { action, logs } = fixture(topic);
    const body = '{ "customer": { "email": "private@example.com", "name": "नमस्ते" } }';
    assert.equal((await action({ request: request(topic, { body }) })).status, 200);
    assert.equal(JSON.stringify(logs).includes("private@example.com"), false);
    assert.equal(JSON.stringify(logs).includes(secret), false);
  });
}

for (const [name, options] of [
  ["wrong secret", { key: "unrelated-shop-secret" }],
  ["missing signature", { headers: { "X-Shopify-Hmac-Sha256": "" } }],
  ["malformed signature", { headers: { "X-Shopify-Hmac-Sha256": "invalid" } }],
  ["changed body", { body: '{"changed":true}', headers: { "X-Shopify-Hmac-Sha256": createHmac("sha256", secret).update("{}").digest("base64") } }],
]) {
  test(`${name}: rejects invalid requests`, async () => {
    const { action } = fixture("shop/redact");
    assert.equal((await action({ request: request("shop/redact", options) })).status, 401);
  });
}

for (const [name, options] of [
  ["missing shop", { headers: { "X-Shopify-Shop-Domain": "" } }],
  ["invalid shop", { headers: { "X-Shopify-Shop-Domain": "example.com" } }],
  ["wrong topic", { headers: { "X-Shopify-Topic": "app/uninstalled" } }],
  ["missing topic", { headers: { "X-Shopify-Topic": "" } }],
  ["invalid JSON", { body: "{" }],
  ["null payload", { body: "null" }],
]) {
  test(`${name}: rejects invalid requests`, async () => {
    const { action } = fixture("shop/redact");
    assert.equal((await action({ request: request("shop/redact", options) })).status, 400);
  });
}

test("missing app secret fails closed even with a separate webhook secret", async () => {
  const { action } = fixture("shop/redact", { env: { SHOPIFY_WEBHOOK_SECRET: secret } });
  assert.equal((await action({ request: request("shop/redact") })).status, 500);
});

test("non-POST actions return 405", async () => {
  const { action } = fixture("shop/redact");
  const response = await action({ request: request("shop/redact", { method: "PUT" }) });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
});
