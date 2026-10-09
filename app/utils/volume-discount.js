import {
  BUNDLE_METAFIELD_KEY,
  BUNDLE_METAFIELD_NAMESPACE,
} from "./bundle-discount";

export const VOLUME_METAFIELD_NAMESPACE = "$app:volume-discount";
export const VOLUME_METAFIELD_KEY = "function-configuration";
export const DEFAULT_VOLUME_FUNCTION_HANDLE = "bundle-pack-3-for-999";
export const DEFAULT_VOLUME_CONFIG = {
  title: "",
  message: "Buy more & save more",
  status: "DRAFT",
  productMode: "all",
  selectedCollectionIds: [],
  selectedProductIds: [],
  application: {
    method: "repeat",
    maxApplications: 0,
    priority: "cheapest",
  },
  combinations: {
    productDiscounts: false,
    orderDiscounts: false,
    shippingDiscounts: false,
  },
  newCustomersOnly: false,
  storefrontMessages: {
    productPage: "",
    cartDrawer: "",
    cartPage: "",
    remainingQuantity: "",
  },
  tiers: [
    {
      minQty: 2,
      discountType: "percentage",
      discountValue: 5,
    },
  ],
};

export function parseVolumeConfig(value) {
  const fallback = { ...DEFAULT_VOLUME_CONFIG, tiers: [...DEFAULT_VOLUME_CONFIG.tiers] };

  if (!value) {
    return {
      ...fallback,
      mode: "collection",
      legacyProducts: [],
    };
  }

  try {
    const parsed = JSON.parse(value);
    const topLevelTiers = normalizeTiers(parsed?.tiers, []);
    const legacyProducts = Array.isArray(parsed?.products)
      ? parsed.products
          .map((product) => ({
            productId:
              typeof product?.productId === "string" ? product.productId : "",
            productTitle:
              typeof product?.productTitle === "string"
                ? product.productTitle
                : "",
            tiers: normalizeTiers(product?.tiers, []),
          }))
          .filter((product) => product.productId)
      : [];

    return {
      title: typeof parsed?.title === "string" ? parsed.title : fallback.title,
      message:
        typeof parsed?.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : fallback.message,
      status:
        parsed?.status === "DRAFT" || parsed?.status === "ACTIVE"
          ? parsed.status
          : fallback.status,
      selectedCollectionIds: normalizeCollectionIds(parsed?.selectedCollectionIds),
      productMode: normalizeProductMode(
        parsed?.productMode,
        parsed?.selectedCollectionIds,
        parsed?.selectedProductIds,
      ),
      selectedProductIds: normalizeProductIds(parsed?.selectedProductIds),
      application: normalizeApplication(parsed?.application),
      combinations: normalizeCombinations(parsed?.combinations),
      newCustomersOnly: Boolean(parsed?.newCustomersOnly),
      storefrontMessages: normalizeStorefrontMessages(parsed?.storefrontMessages),
      tiers: topLevelTiers,
      mode:
        topLevelTiers.length > 0 || legacyProducts.length === 0
          ? "collection"
          : "legacy-product",
      legacyProducts,
    };
  } catch {
    return {
      ...fallback,
      mode: "collection",
      legacyProducts: [],
    };
  }
}

export function normalizeVolumeConfig(config) {
  return {
    title: String(config?.title || "").trim() || "Quantity offer",
    message:
      String(config?.message || "").trim() || DEFAULT_VOLUME_CONFIG.message,
    status:
      config?.status === "DRAFT" || config?.status === "ACTIVE"
        ? config.status
        : DEFAULT_VOLUME_CONFIG.status,
    selectedCollectionIds: normalizeCollectionIds(config?.selectedCollectionIds),
    productMode: normalizeProductMode(
      config?.productMode,
      config?.selectedCollectionIds,
      config?.selectedProductIds,
    ),
    selectedProductIds: normalizeProductIds(config?.selectedProductIds),
    application: normalizeApplication(config?.application),
    combinations: normalizeCombinations(config?.combinations),
    newCustomersOnly: Boolean(config?.newCustomersOnly),
    storefrontMessages: normalizeStorefrontMessages(config?.storefrontMessages),
    tiers: normalizeTiers(config?.tiers, DEFAULT_VOLUME_CONFIG.tiers),
  };
}

export function validateVolumeConfig(config, { allowLegacy = false } = {}) {
  const errors = [];

  if (!String(config?.title || "").trim()) {
    errors.push("Discount title is required.");
  }

  if (!allowLegacy && (!Array.isArray(config?.tiers) || config.tiers.length === 0)) {
    errors.push("Add at least one volume tier.");
  }

  if (
    config?.productMode === "collections" &&
    (!Array.isArray(config?.selectedCollectionIds) || config.selectedCollectionIds.length === 0)
  ) {
    errors.push("Choose at least one collection.");
  }

  if (
    config?.productMode === "products" &&
    (!Array.isArray(config?.selectedProductIds) || config.selectedProductIds.length === 0)
  ) {
    errors.push("Choose at least one product.");
  }

  if (
    config?.application?.method === "limit" &&
    Number(config.application.maxApplications) < 1
  ) {
    errors.push("Enter a maximum number of discount applications.");
  }

  const seenQuantities = new Set();
  for (const tier of config?.tiers || []) {
    if (tier.minQty < 2) {
      errors.push("Tier quantity must be 2 or more.");
    }

    if (tier.discountValue <= 0) {
      errors.push("Tier discount value must be greater than 0.");
    }

    if (tier.discountType === "percentage" && tier.discountValue > 100) {
      errors.push("Percentage off cannot be more than 100%.");
    }

    if (seenQuantities.has(tier.minQty)) {
      errors.push("Each tier quantity must be unique.");
    }

    seenQuantities.add(tier.minQty);
  }

  return errors;
}

export function formatVolumeDiscountInput({
  title,
  startsAt,
  endsAt,
  functionHandle,
  config,
}) {
  return {
    title: String(title || config.title || "").trim() || "Volume discount",
    startsAt: startsAt || new Date().toISOString(),
    endsAt: endsAt || null,
    functionHandle: functionHandle || DEFAULT_VOLUME_FUNCTION_HANDLE,
    discountClasses: ["PRODUCT"],
    combinesWith: normalizeCombinations(config.combinations),
    metafields: [
      {
        namespace: VOLUME_METAFIELD_NAMESPACE,
        key: VOLUME_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(config),
      },
      {
        namespace: BUNDLE_METAFIELD_NAMESPACE,
        key: BUNDLE_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify({
          selectedCollectionIds: normalizeCollectionIds(config.selectedCollectionIds),
          productMode: normalizeProductMode(
            config.productMode,
            config.selectedCollectionIds,
            config.selectedProductIds,
          ),
          selectedProductIds: normalizeProductIds(config.selectedProductIds),
        }),
      },
    ],
  };
}

export function resolveVolumeTierLabel(tier) {
  const minQty = toPositiveInteger(tier?.minQty, 2);
  const discountType = tier?.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = toPositiveNumber(tier?.discountValue, 0);

  return discountType === "fixed"
    ? `Discount ${minQty} items and save ${discountValue} each`
    : `Discount ${minQty} items and get ${discountValue}% off`;
}

function normalizeCollectionIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index);
}

function normalizeProductIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index);
}

function normalizeProductMode(value, collectionIds, productIds) {
  if (value === "collections" || value === "products" || value === "all") {
    return value;
  }

  if (normalizeProductIds(productIds).length > 0) {
    return "products";
  }

  return normalizeCollectionIds(collectionIds).length > 0 ? "collections" : "all";
}

function normalizeApplication(value) {
  return {
    method:
      value?.method === "once" || value?.method === "limit" || value?.method === "repeat"
        ? value.method
        : DEFAULT_VOLUME_CONFIG.application.method,
    maxApplications: toNonNegativeInteger(value?.maxApplications, 0),
    priority:
      value?.priority === "most_expensive" ? "most_expensive" : "cheapest",
  };
}

function normalizeCombinations(value) {
  return {
    productDiscounts: Boolean(value?.productDiscounts),
    orderDiscounts: Boolean(value?.orderDiscounts),
    shippingDiscounts: Boolean(value?.shippingDiscounts),
  };
}

function normalizeStorefrontMessages(value) {
  return {
    productPage: String(value?.productPage || "").trim(),
    cartDrawer: String(value?.cartDrawer || "").trim(),
    cartPage: String(value?.cartPage || "").trim(),
    remainingQuantity: String(value?.remainingQuantity || "").trim(),
  };
}

function normalizeTiers(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;

  return source
    .map((tier) => ({
      minQty: toPositiveInteger(tier?.minQty, 2),
      discountType: tier?.discountType === "fixed" ? "fixed" : "percentage",
      discountValue: toPositiveNumber(tier?.discountValue, 0),
    }))
    .filter((tier) => tier.discountValue > 0)
    .sort((left, right) => left.minQty - right.minQty);
}

function toPositiveInteger(value, fallback) {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function toPositiveNumber(value, fallback) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function toNonNegativeInteger(value, fallback) {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue >= 0
    ? numberValue
    : fallback;
}
