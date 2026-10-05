export const BUNDLE_METAFIELD_NAMESPACE = "$app:bundle-discount";
export const BUNDLE_METAFIELD_KEY = "function-configuration";
export const DEFAULT_FUNCTION_HANDLE = "bundle-pack-3-for-999";
export const DEFAULT_BUNDLE_CONFIG = {
  version: 2, discountType: "bundle",
  bundleTiers: [{ quantity: 2, freeQuantity: 0, discountType: "fixed_price", value: 799, maxBundles: 0 }],
  application: { method: "once", maxBundles: 1, maxDiscountedItems: 0, priority: "cheapest" },
  eligibility: { productMode: "all", selectedCollectionIds: [], selectedProductIds: [], excludedProductIds: [], minimumCartValue: 0, minimumQuantity: 0, customerMode: "all", customerSegmentIds: [], newCustomersOnly: false },
  combinations: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false },
  messages: { productPage: "", cartDrawer: "", cartPage: "", confirmation: "Your bundle saving has been applied", remainingQuantity: "" },
  selectedCollectionIds: [], message: "Your bundle saving has been applied",
};

export function parseCollectionIds(value) { return parseGids(value, "Collection"); }
export function parseBundleConfig(value) { try { return normalize(JSON.parse(value)); } catch { return cloneDefault(); } }

export function buildBundleConfig(formData) {
  const collections = parseGids(formData.getAll("selectedCollectionIds"), "Collection");
  const products = parseGids(formData.getAll("selectedProductIds"), "Product");
  const excluded = parseGids(formData.getAll("excludedProductIds"), "Product");
  const segments = parseGids(formData.getAll("customerSegmentIds"), "Segment");
  const quantities = formData.getAll("bundleTierQuantity");
  const tiers = normalizeTiers(quantities.map((quantity, index) => ({
    quantity, freeQuantity: formData.getAll("bundleTierFreeQuantity")[index], discountType: formData.getAll("bundleTierDiscountType")[index],
    value: formData.getAll("bundleTierValue")[index], maxBundles: formData.getAll("bundleTierMaxBundles")[index],
  })), []);
  const mode = ["all", "collections", "products"].includes(formData.get("productMode")) ? formData.get("productMode") : "all";
  const method = ["once", "repeat", "limit_bundles", "limit_items"].includes(formData.get("applicationMethod")) ? formData.get("applicationMethod") : "once";
  return {
    config: normalize({
      version: 2, bundleTiers: tiers,
      application: { method, maxBundles: formData.get("maxBundles"), maxDiscountedItems: formData.get("maxDiscountedItems"), priority: formData.get("itemPriority") },
      eligibility: { productMode: mode, selectedCollectionIds: collections.ids, selectedProductIds: products.ids, excludedProductIds: excluded.ids, minimumCartValue: formData.get("minimumCartValue"), minimumQuantity: formData.get("minimumQuantity"), customerMode: formData.get("customerMode"), customerSegmentIds: segments.ids, newCustomersOnly: formData.get("newCustomersOnly") === "true" },
      combinations: { productDiscounts: formData.get("combineProductDiscounts") === "true", orderDiscounts: formData.get("combineOrderDiscounts") === "true", shippingDiscounts: formData.get("combineShippingDiscounts") === "true" },
      messages: { productPage: formData.get("productPageMessage"), cartDrawer: formData.get("cartDrawerMessage"), cartPage: formData.get("cartPageMessage"), confirmation: formData.get("message"), remainingQuantity: formData.get("remainingQuantityMessage") },
    }),
    invalidCollectionIds: collections.invalid, invalidProductIds: [...products.invalid, ...excluded.invalid], invalidSegmentIds: segments.invalid,
  };
}

export function validateBundleConfig(config, rawTierCount = 0) {
  const errors = []; const tiers = config.bundleTiers;
  if (!rawTierCount || !tiers.length) errors.push("Add at least one bundle quantity tier.");
  if (tiers.some((tier) => tier.quantity < 2)) errors.push("Bundle quantity must be 2 or more.");
  if (tiers.some((tier) => tier.discountType === "free" && tier.freeQuantity < 1)) errors.push("Buy X get Y free tiers need at least one free item.");
  if (tiers.some((tier) => tier.discountType !== "free" && tier.value <= 0)) errors.push("Each fixed-price or percentage tier needs a value greater than 0.");
  if (tiers.some((tier) => tier.discountType === "percentage" && tier.value > 100)) errors.push("Percentage off cannot be more than 100%.");
  if (new Set(tiers.map((tier) => tier.quantity)).size !== tiers.length) errors.push("Each tier buy quantity must be unique.");
  if (config.application.method === "limit_bundles" && config.application.maxBundles < 1) errors.push("Enter a maximum number of bundles.");
  if (config.application.method === "limit_items" && config.application.maxDiscountedItems < 1) errors.push("Enter a maximum number of discounted items.");
  if (config.eligibility.productMode === "collections" && !config.eligibility.selectedCollectionIds.length) errors.push("Choose at least one collection.");
  if (config.eligibility.productMode === "products" && !config.eligibility.selectedProductIds.length) errors.push("Choose at least one product.");
  if (config.eligibility.customerMode === "segments" && !config.eligibility.customerSegmentIds.length) errors.push("Enter at least one customer segment ID.");
  return errors;
}

export function formatBundleDiscountInput({ title, startsAt, endsAt, functionHandle, config, previousConfig }) {
  const segmentIds = config.eligibility.customerMode === "segments" ? config.eligibility.customerSegmentIds : [];
  const previousIds = previousConfig?.eligibility?.customerSegmentIds || [];
  // Version 1 offers were created as ORDER discounts. Preserve that class
  // when one is edited, rather than changing its calculation semantics.
  const discountClasses = Number(config.version) < 2 ? ["ORDER"] : ["PRODUCT"];
  return {
    title: String(title || "").trim() || "Bundle Discount", startsAt: startsAt || new Date().toISOString(), endsAt: endsAt || null,
    functionHandle: functionHandle || DEFAULT_FUNCTION_HANDLE, discountClasses, combinesWith: config.combinations,
    context: segmentIds.length ? { customerSegments: { add: segmentIds, remove: previousIds.filter((id) => !segmentIds.includes(id)) } } : { all: "ALL" },
    metafields: [{ namespace: BUNDLE_METAFIELD_NAMESPACE, key: BUNDLE_METAFIELD_KEY, type: "json", value: JSON.stringify(config) }],
  };
}

export function isBundleConfig(config) { return Array.isArray(config?.bundleTiers) && config.bundleTiers.length > 0; }
export function toIsoDateTime(value) { const parsed = new Date(String(value || "").trim()); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
export function toErrorMessage(error) { return error instanceof Error ? error.message : String(error); }

function normalize(source = {}) {
  const base = cloneDefault(); const legacyCollections = ids(source.selectedCollectionIds);
  const raw = source.eligibility || {}; const productMode = ["collections", "products"].includes(raw.productMode) ? raw.productMode : legacyCollections.length ? "collections" : "all";
  const config = {
    ...base, version: Number(source.version) >= 2 ? 2 : 1, bundleTiers: normalizeTiers(source.bundleTiers, base.bundleTiers),
    application: { method: ["once", "repeat", "limit_bundles", "limit_items"].includes(source.application?.method) ? source.application.method : "once", maxBundles: integer(source.application?.maxBundles, source.application?.method === "once" ? 1 : 0), maxDiscountedItems: integer(source.application?.maxDiscountedItems, 0), priority: source.application?.priority === "most_expensive" ? "most_expensive" : "cheapest" },
    eligibility: { productMode, selectedCollectionIds: ids(raw.selectedCollectionIds ?? legacyCollections), selectedProductIds: ids(raw.selectedProductIds), excludedProductIds: ids(raw.excludedProductIds), minimumCartValue: number(raw.minimumCartValue, 0), minimumQuantity: integer(raw.minimumQuantity, 0), customerMode: raw.customerMode === "segments" ? "segments" : "all", customerSegmentIds: ids(raw.customerSegmentIds), newCustomersOnly: Boolean(raw.newCustomersOnly) },
    combinations: { productDiscounts: Boolean(source.combinations?.productDiscounts), orderDiscounts: Boolean(source.combinations?.orderDiscounts), shippingDiscounts: Boolean(source.combinations?.shippingDiscounts) },
    messages: { productPage: string(source.messages?.productPage), cartDrawer: string(source.messages?.cartDrawer), cartPage: string(source.messages?.cartPage), confirmation: string(source.messages?.confirmation ?? source.message) || base.message, remainingQuantity: string(source.messages?.remainingQuantity) },
  };
  config.selectedCollectionIds = config.eligibility.selectedCollectionIds; config.message = config.messages.confirmation; return config;
}
function cloneDefault() { return JSON.parse(JSON.stringify(DEFAULT_BUNDLE_CONFIG)); }
function parseGids(value, resource) { const invalid = []; const valid = rawValues(value).map((id) => { if (/^\d+$/.test(id)) return `gid://shopify/${resource}/${id}`; if (new RegExp(`^gid://shopify/${resource}/\\d+$`).test(id)) return id; invalid.push(id); return null; }).filter(Boolean); return { ids: [...new Set(valid)], invalid }; }
function rawValues(value) { return (Array.isArray(value) ? value : [value]).flatMap((item) => String(item || "").split(/[\n,]+/)).map((item) => item.trim()).filter(Boolean); }
function ids(value) { return [...new Set(rawValues(value))]; }
function normalizeTiers(value, fallback) { const used = new Set(); const result = (Array.isArray(value) ? value : []).map((tier) => ({ quantity: integer(tier?.quantity, 0), freeQuantity: integer(tier?.freeQuantity, 0), discountType: ["percentage", "free"].includes(tier?.discountType) ? tier.discountType : "fixed_price", value: number(tier?.value ?? tier?.price, 0), maxBundles: integer(tier?.maxBundles, 0) })).filter((tier) => tier.quantity >= 2 && (tier.discountType === "free" ? tier.freeQuantity > 0 : tier.value > 0)).filter((tier) => !used.has(tier.quantity) && used.add(tier.quantity)); return result.length ? result : fallback; }
function string(value) { return typeof value === "string" ? value.trim() : ""; }
function integer(value, fallback) { const result = Number(value); return Number.isInteger(result) && result >= 0 ? result : fallback; }
function number(value, fallback) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : fallback; }
