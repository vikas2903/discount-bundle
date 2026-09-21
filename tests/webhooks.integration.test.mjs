import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "vite";

test("all six route modules acknowledge signed deliveries without database or API dependencies", async () => {
  process.env.SHOPIFY_API_SECRET = "integration-test-secret";
  process.env.SHOPIFY_WEBHOOK_SECRET = "different-secret-must-not-be-used";
  delete process.env.DATABASE_URL;
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    plugins: [{
      name: "forbid-webhook-database-and-api-dependencies",
      enforce: "pre",
      resolveId(id) {
        if (/db[.]server|shopify[.]server|prisma|@shopify\//i.test(id)) {
          throw new Error(`Webhook imported a forbidden dependency: ${id}`);
        }
      },
    }],
  });
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Unexpected outbound network request"); };
  try {
    const routes = {
      "app.scopes_update": ["app/scopes_update"],
      "app.uninstalled": ["app/uninstalled"],
      "customers.data_request": ["customers/data_request"],
      "customers.redact": ["customers/redact"],
      "shop.redact": ["shop/redact"],
      compliance: ["customers/data_request", "customers/redact", "shop/redact"],
    };
    for (const [route, topics] of Object.entries(routes)) {
      const module = await server.ssrLoadModule(`/app/routes/webhooks.${route}.jsx`);
      assert.equal((await module.loader()).status, 200);
      for (const topic of topics) {
        const body = JSON.stringify(topic === "app/scopes_update" ? { current: ["read_products"] } : {});
        const deliver = (valid) => module.action({ request: new Request(`https://example.com/webhooks/${route.replaceAll(".", "/")}`, {
          method: "POST", body,
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Topic": topic,
            "X-Shopify-Shop-Domain": "webhook-test.myshopify.com",
            "X-Shopify-Webhook-Id": "integration-delivery",
            "X-Shopify-Hmac-Sha256": createHmac("sha256", valid ? process.env.SHOPIFY_API_SECRET : "incorrect").update(body).digest("base64"),
          },
        }) });
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await deliver(true);
          assert.equal(response.status, 200, `${route}: ${topic}, attempt ${attempt + 1}`);
          assert.equal(await response.text(), "ok");
        }
        assert.equal((await deliver(false)).status, 401, `${route}: rejects invalid signatures`);
      }
    }
  } finally {
    global.fetch = originalFetch;
    await server.close();
  }
});
