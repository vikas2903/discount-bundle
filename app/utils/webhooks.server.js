import { createHmac, timingSafeEqual } from "node:crypto";

const textResponse = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });

// A GET checks route reachability only. Shopify deliveries use signed POSTs.
export const webhookHealth = () => textResponse("ok");

/**
 * These handlers acknowledge deliveries without database or Admin API access.
 * Verify the raw bytes directly: authenticate.webhook() can refresh an expired
 * offline token, which fails after uninstall because Shopify revoked the token.
 */
export function createWebhookAction(topics, { env = process.env, logger = console } = {}) {
  return async ({ request }) => {
    const started = Date.now();
    let topic;
    let shop;
    const finish = (status, reason, headers) => {
      const entry = {
        path: new URL(request.url).pathname,
        webhookId: request.headers.get("X-Shopify-Webhook-Id"),
        topic,
        shop,
        status,
        reason,
        durationMs: Date.now() - started,
      };
      // Never log payloads, signatures, secrets, or tokens.
      if (status >= 500) logger.error("[webhook]", entry);
      else if (status >= 400) logger.warn("[webhook]", entry);
      else logger.info("[webhook]", entry);
      return textResponse(status === 200 ? "ok" : reason, status, headers);
    };

    if (request.method !== "POST") {
      return finish(405, "method_not_allowed", { Allow: "POST" });
    }

    // App-configured subscriptions are signed with the app client secret.
    // A shop-admin notification secret (SHOPIFY_WEBHOOK_SECRET) is unrelated.
    const secret = env.SHOPIFY_API_SECRET?.trim();
    if (!secret) return finish(500, "missing_app_secret");

    try {
      const rawBody = Buffer.from(await request.arrayBuffer());
      const signature = request.headers.get("X-Shopify-Hmac-Sha256") || "";
      const expected = createHmac("sha256", secret).update(rawBody).digest();
      const received = Buffer.from(signature, "base64");
      if (
        received.length !== expected.length ||
        received.toString("base64") !== signature ||
        !timingSafeEqual(expected, received)
      ) {
        return finish(401, "invalid_hmac");
      }

      topic = request.headers.get("X-Shopify-Topic");
      shop = request.headers.get("X-Shopify-Shop-Domain");
      if (!topics.includes(topic)) return finish(400, "unexpected_topic");
      if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
        return finish(400, "invalid_shop");
      }
      shop = shop.toLowerCase();

      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return finish(400, "invalid_json");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return finish(400, "invalid_payload");
      }

      // Acknowledge receipt only. This does not erase stored data or update
      // session scopes; any required data handling must happen separately.
      return finish(200, "acknowledged");
    } catch {
      return finish(500, "request_failed");
    }
  };
}
