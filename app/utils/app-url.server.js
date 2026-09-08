export function getAppUrl(environment = process.env) {
  const value = environment.SHOPIFY_APP_URL?.trim();
  if (!value) throw new Error("[Shopify config] Set SHOPIFY_APP_URL to the public HTTPS app URL in Railway.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("[Shopify config] SHOPIFY_APP_URL must be a plain HTTPS URL, without Markdown or quotes.");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("[Shopify config] SHOPIFY_APP_URL must be an HTTPS origin without a path, query, or credentials.");
  }
  return url.origin;
}
