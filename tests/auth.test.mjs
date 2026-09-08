import test from "node:test";
import assert from "node:assert/strict";
import { buildEmbeddedHref } from "../app/utils/embedded-navigation.js";
import { getAppUrl } from "../app/utils/app-url.server.js";
import { getDiscountAnalytics, getShopCurrencyCode } from "../app/services/analytics.server.js";

test("navigation retains embedding context without replaying launch credentials", () => {
  const href = buildEmbeddedHref("/app/analytics", "?host=admin&embedded=1&id_token=expired&hmac=signature&timestamp=123&billing_error=old", "live.myshopify.com");
  const url = new URL(href, "https://app.example.com");
  assert.equal(url.searchParams.get("shop"), "live.myshopify.com");
  assert.equal(url.searchParams.get("host"), "admin");
  assert.equal(url.searchParams.get("embedded"), "1");
  for (const key of ["id_token", "hmac", "timestamp", "billing_error"]) {
    assert.equal(url.searchParams.has(key), false);
  }
});

test("app URL is normalized and invalid production configuration fails clearly", () => {
  assert.equal(getAppUrl({ SHOPIFY_APP_URL: " https://app.up.railway.app/ " }), "https://app.up.railway.app");
  for (const value of [undefined, "", "http://app.example.com", "[App](https://app.example.com)", "https://app.example.com/auth", "https://user:secret@app.example.com"]) {
    assert.throws(() => getAppUrl({ SHOPIFY_APP_URL: value }), /Shopify config/);
  }
});

for (const load of [getShopCurrencyCode, getDiscountAnalytics]) {
  for (const status of [302, 401]) {
    test(`${load.name} preserves Shopify ${status} recovery responses`, async () => {
      const response = new Response(null, { status, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } });
      await assert.rejects(load({ graphql: async () => { throw response; } }), (error) => error === response);
    });
  }
}

test("dashboard remains usable when order access is denied on a live store", async () => {
  const result = await getDiscountAnalytics({ graphql: async () => Response.json({ errors: [{ message: "Access denied for orders field" }] }) });
  assert.deepEqual(result.orders, []);
  assert.match(result.graphqlErrors[0].message, /Access denied/);
});
