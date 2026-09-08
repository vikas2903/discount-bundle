// Launch credentials are short-lived. Keep only embedding context on later
// navigations so Shopify can obtain a fresh session token when necessary.
export function buildEmbeddedHref(path, search, shop) {
  const incoming = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of ["shop", "host", "embedded", "locale"]) {
    const value = incoming.get(key);
    if (value) params.set(key, value);
  }
  if (shop) params.set("shop", shop);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
