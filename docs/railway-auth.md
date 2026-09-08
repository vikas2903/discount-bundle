# Railway authentication deployment

Deploy this directory (`discount-bundle-app`) using its Dockerfile. Set the Railway variables below; local `.env` files are deliberately excluded from the image.

```text
NODE_ENV=production
SHOPIFY_APP_URL=https://discount-bundle-production.up.railway.app
SHOPIFY_API_KEY=<Client ID of the installed Shopify app>
SHOPIFY_API_SECRET=<Client secret for that same app>
SCOPES=read_discounts,read_orders,read_products,read_themes,write_discounts
DATABASE_URL=file:/data/dev.sqlite
SHOPIFY_BILLING_TEST=false
SHOPIFY_SKIP_BILLING=false
```

Mount a Railway volume at `/data` and use one replica with this SQLite schema. A PostgreSQL URL will not work with the current Prisma provider. Preserve any existing session database when setting up the volume. Startup runs Prisma migrations; do not reset the database to troubleshoot auth.

Both Shopify TOML files currently identify client ID `6768c8ee8bcc15436a4881b9250a8860`. Railway credentials must belong to that app. If production uses a separate app, update its config and credentials together. Never paste the secret into source files or logs.

Release the Shopify configuration with `npm run deploy` after deploying the Railway code. This is a separate deployment: Railway does not update Shopify's URLs or scopes. Verify the released app URL equals `SHOPIFY_APP_URL` and the allowed callback is `https://discount-bundle-production.up.railway.app/auth/callback`. Automatic development URL updates are disabled in these production configurations; use a separate app/config for CLI development.

Open the installed app from the live store's Shopify Admin. Check initial dashboard load, navigation after more than a minute, and reopening after a Railway restart. Verify quantity offer actions and the existing billing return flow. These authenticated checks require access to the live store.

If authentication still fails, inspect Railway logs for the same launch:

- Invalid JWT/audience/signature: verify the client ID and secret belong to the installed app, and the released URL points at this service.
- Prisma/table/column errors: verify migrations completed against the mounted database. An older database whose original migration lacks refresh-token columns needs a forward migration; do not edit an already applied migration or reset live sessions.
- Order access denied: check `read_orders` and the app's protected customer data approval in Shopify. Development-store access does not establish live-store approval. The dashboard reports a data warning when this lookup fails.

Local regression checks: `node --test tests/auth.test.mjs` and `npm run build`.

References: [Shopify auth and response boundaries](https://shopify.dev/docs/api/shopify-app-react-router/latest/guide-admin), [deployment requirements](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service).
