# Webhook failures, deployment, and testing

A failure means Shopify did not receive a successful HTTP response for a delivery attempt. It expects a 2xx response within five seconds; redirects, 400/401/500 responses, and connection failures count as failures. The screenshot's 90.3% is the percentage of failed attempts in the selected seven-day period, including retries. It does not identify the underlying error. See [Shopify delivery verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

## What changed

All five configured webhook routes and the legacy `/webhooks/compliance` route now share `app/utils/webhooks.server.js`:

- Verify HMAC-SHA256 against the original request bytes using `SHOPIFY_API_SECRET`, the app client secret. A separate `SHOPIFY_WEBHOOK_SECRET` no longer overrides it for privacy routes.
- Process without loading a session or refreshing an access token. The installed Shopify authentication library attempts offline-token refresh during `authenticate.webhook()`, which can fail after uninstall when tokens have been revoked.
- Acknowledge all supported topics with 200 without importing a database client, reading/writing sessions, or calling Shopify APIs. Duplicate valid deliveries also succeed.
- Reject invalid signatures with 401 and invalid topics/payloads with 400. Success means receipt was acknowledged, not that stored data was changed.
- Log `[webhook]` with the route, delivery ID, topic, shop, status, reason, and duration. Payloads and credentials are excluded.

These handlers perform acknowledgement only, as requested. They do not delete existing shop sessions, export data, or update stored permissions. Any required privacy data handling must happen separately; a 200 response alone does not complete a data deletion request.

## Run the automated tests

From `discount-bundle-app`:

```powershell
npm run test:webhooks
npm run test:webhooks:integration
```

The first command tests signatures, first-call success, duplicate deliveries, and malformed requests. The second builds the app and loads all six actual route modules with Vite, then sends signed requests to their actions. Database and Shopify API imports are forbidden in that test, and outbound API calls are blocked. No test database, migrations, or database credentials are needed.

## Deploy the server code

1. Deploy the updated `discount-bundle-app` source to the existing Railway service. `npm run deploy` alone publishes Shopify configuration/extensions; it does not upload this server code to Railway.
2. Confirm Railway's `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` belong to the same Shopify app. Both current TOML files identify client ID `6768c8ee8bcc15436a4881b9250a8860`. Use its client secret, not a store-admin notification secret.
3. Keep `SHOPIFY_APP_URL=https://discount-bundle-production.up.railway.app`. Webhook handlers need no database. The rest of the app still uses session storage during authentication/startup; its existing settings are described in [Railway authentication deployment](railway-auth.md).
4. In Shopify's released app configuration, confirm the application URL and webhook paths below. If that configuration is outdated, release the intended config with `npm run deploy -- --config discount-bundle-app` after Railway is healthy.

| Topic | URI |
| --- | --- |
| `app/uninstalled` | `/webhooks/app/uninstalled` |
| `app/scopes_update` | `/webhooks/app/scopes_update` |
| `customers/data_request` | `/webhooks/customers/data_request` |
| `customers/redact` | `/webhooks/customers/redact` |
| `shop/redact` | `/webhooks/shop/redact` |

Both current TOML files have `automatically_update_urls_on_dev = true`. When running CLI development, verify the app has not been pointed to an old development tunnel. Use a separate development app/config to keep production delivery pointed at Railway.

## Send signed sample deliveries

After deploying, run these commands from the app directory. Use the matching app client secret if the CLI prompts for it. Do not paste a secret into source code or a command committed to Git.

```powershell
npm run shopify -- app webhook trigger --topic app/uninstalled --api-version 2026-07 --client-id 6768c8ee8bcc15436a4881b9250a8860 --address https://discount-bundle-production.up.railway.app/webhooks/app/uninstalled
npm run shopify -- app webhook trigger --topic shop/redact --api-version 2026-07 --client-id 6768c8ee8bcc15436a4881b9250a8860 --address https://discount-bundle-production.up.railway.app/webhooks/shop/redact
```

Repeat with each remaining topic and its URI from the table. Expect HTTP **200**, body **ok**, and a Railway `[webhook]` entry with `status: 200` and `reason: acknowledged`. Run a sample twice to verify retry handling. For local delivery, use the same commands with `http://localhost:PORT/webhooks/...` while the app server is running.

Opening an endpoint in a browser sends GET and returns a reachability response only. It does not test signatures or POST handling. An unsigned POST should return **401**; that is a successful security check.

CLI deliveries use sample data, do not retry, and do not validate registered subscriptions. For an end-to-end check, uninstall the app from a **development store**, then inspect the actual `app/uninstalled` delivery. Use Shopify's privacy webhook test facility if available for the privacy topics. See [Shopify CLI webhook testing](https://shopify.dev/docs/api/shopify-cli/app/app-webhook-trigger).

## Confirm success and investigate remaining failures

Open **Dev Dashboard → Apps → Discount Bundle App → Logs → Webhooks**. Filter by topic and inspect a new delivery's response, URI, time, and webhook ID. Match that ID to Railway logs. Shopify logs can lag by several minutes. See [Shopify's troubleshooting guide](https://shopify.dev/docs/apps/build/webhooks/troubleshoot).

| Response / log reason | What to check |
| --- | --- |
| `200 / acknowledged` | Delivery acknowledged; no stored data changed. |
| `401 / invalid_hmac` | Matching app client secret on Railway and the sender; correct app selected in the CLI; body not modified by a proxy. |
| `400 / unexpected_topic` or `invalid_shop` | Topic, URI, and Shopify headers on the delivery. |
| `400 / invalid_json`, `invalid_payload` | Test payload shape. |
| `500 / missing_app_secret` | Railway `SHOPIFY_API_SECRET`. |
| `500 / request_failed` | Request body could not be read or an unexpected handler error occurred. |
| `404`, redirect, or no `[webhook]` log | Deployed server version, destination URL, proxy routing, or an expired development tunnel. |
| Timeout / connection error | Railway service availability and response time. |

Old failures remain in the selected monitoring window after a fix. Judge the deployment by new delivery results; the seven-day percentage improves as successful deliveries arrive and older failures leave that window.
