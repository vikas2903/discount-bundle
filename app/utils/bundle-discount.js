export const BUNDLE_METAFIELD_NAMESPACE = "$app:bundle-discount";
export const BUNDLE_METAFIELD_KEY = "function-configuration";
export const DEFAULT_FUNCTION_HANDLE = "bundle-pack-3-for-999";
export const DEFAULT_BUNDLE_CONFIG = {
  discountType: "bundle",
  bundleTiers: [
    { quantity: 2, freeQuantity: 0, discountType: "fixed_price", value: 799 },
  ],
  selectedCollectionIds: [],
  message: "Your bundle saving has been applied",
};

export function parseCollectionIds(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const invalid = [];
  const ids = rawValues
    .flatMap((entry) => String(entry || "").split(/[\n,]+/))
    .map((collectionId) => collectionId.trim())
    .filter(Boolean)
    .map((collectionId) => normalizeCollectionId(collectionId))
    .filter((result) => {
      if (!result.valid) {
        invalid.push(result.input);
      }

      return result.valid;
    })
    .map((result) => result.id);

  return { ids, invalid };
}

export function parseBundleConfig(value) {
  if (!value) {
    return DEFAULT_BUNDLE_CONFIG;
  }

  try {
    const config = JSON.parse(value);
    const bundleTiers = normalizeBundleTiers(config.bundleTiers, []);

    return {
      discountType:
        config.discountType === "bundle" ? config.discountType : "bundle",
      bundleTiers,
      selectedCollectionIds: Array.isArray(config.selectedCollectionIds)
        ? config.selectedCollectionIds.filter((id) => typeof id === "string")
        : [],
      message:
        typeof config.message === "string" && config.message.trim()
          ? config.message.trim()
          : DEFAULT_BUNDLE_CONFIG.message,
    };
  } catch {
    return DEFAULT_BUNDLE_CONFIG;
  }
}

export function buildBundleConfig(formData) {
  const {
    ids: selectedCollectionIds,
    invalid: invalidCollectionIds,
  } = parseCollectionIds(formData.getAll("selectedCollectionIds"));
  const bundleTierQuantities = formData.getAll("bundleTierQuantity");
  const bundleTierTypes = formData.getAll("bundleTierDiscountType");
  const bundleTierValues = formData.getAll("bundleTierValue");
  const bundleTierFreeQuantities = formData.getAll("bundleTierFreeQuantity");
  const bundleTiers = normalizeBundleTiers(
    bundleTierQuantities.map((quantity, index) => ({
      quantity,
      freeQuantity: bundleTierFreeQuantities[index],
      discountType: bundleTierTypes[index],
      value: bundleTierValues[index],
    })),
    [],
  );

  return {
    config: {
      discountType: "bundle",
      bundleTiers,
      selectedCollectionIds,
      message:
        String(formData.get("message") || "").trim() ||
        DEFAULT_BUNDLE_CONFIG.message,
    },
    invalidCollectionIds,
  };
}

export function validateBundleConfig(config, rawTierCount = 0) {
  const errors = [];
  const quantities = config.bundleTiers.map((tier) => tier.quantity);
  const uniqueQuantityCount = new Set(quantities).size;

  if (rawTierCount === 0 || config.bundleTiers.length === 0) {
    errors.push("Add at least one bundle quantity offer.");
  }

  if (config.bundleTiers.some((tier) => tier.quantity < 2)) {
    errors.push("Bundle quantity must be 2 or more.");
  }

  if (config.bundleTiers.some((tier) => tier.discountType === "free" && tier.freeQuantity < 1)) {
    errors.push("Buy X get Y free offers must include at least one free item.");
  }

  if (config.bundleTiers.some((tier) => tier.discountType !== "free" && tier.value <= 0)) {
    errors.push("The saving amount must be greater than 0.");
  }

  if (config.bundleTiers.some((tier) => tier.discountType === "percentage" && tier.value > 100)) {
    errors.push("Percentage off cannot be more than 100%.");
  }

  if (uniqueQuantityCount !== quantities.length) {
    errors.push("Each bundle quantity must be unique.");
  }

  return errors;
}

export function formatBundleDiscountInput({
  title,
  startsAt,
  endsAt,
  functionHandle,
  config,
}) {
  return {
    title: String(title || "").trim() || "Bundle Discount",
    startsAt: startsAt || new Date().toISOString(),
    endsAt: endsAt || null,
    functionHandle: functionHandle || DEFAULT_FUNCTION_HANDLE,
    discountClasses: ["ORDER"],
    combinesWith: {
      productDiscounts: false,
      orderDiscounts: false,
      shippingDiscounts: false,
    },
    metafields: [
      {
        namespace: BUNDLE_METAFIELD_NAMESPACE,
        key: BUNDLE_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(config),
      },
    ],
  };
}

export function isBundleConfig(config) {
  return Array.isArray(config?.bundleTiers) && config.bundleTiers.length > 0;
}

export function toIsoDateTime(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeCollectionId(value) {
  if (/^\d+$/.test(value)) {
    return { valid: true, id: `gid://shopify/Collection/${value}` };
  }

  if (/^gid:\/\/shopify\/Collection\/\d+$/.test(value)) {
    return { valid: true, id: value };
  }

  if (/^gid:shopify\/Collection\/\d+$/.test(value)) {
    return {
      valid: true,
      id: value.replace("gid:shopify/", "gid://shopify/"),
    };
  }

  return { valid: false, input: value };
}

function toPositiveNumber(value, fallback) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function normalizeBundleTiers(value, fallback) {
  const fallbackTiers = Array.isArray(fallback) ? fallback : [];
  const seenQuantities = new Set();
  const tiers = (Array.isArray(value) ? value : [])
    .map((tier) => ({
      quantity: toPositiveInteger(tier?.quantity, 0),
      freeQuantity: toPositiveInteger(tier?.freeQuantity, 0),
      discountType: ["percentage", "free"].includes(tier?.discountType)
        ? tier.discountType
        : "fixed_price",
      // Existing offers stored `price`; retain them as fixed-price offers.
      value: toPositiveNumber(tier?.value ?? tier?.price, 0),
    }))
    .filter((tier) => tier.quantity >= 2 && (tier.discountType === "free" ? tier.freeQuantity > 0 : tier.value > 0))
    .sort((left, right) => left.quantity - right.quantity)
    .filter((tier) => {
      if (seenQuantities.has(tier.quantity)) {
        return false;
      }

      seenQuantities.add(tier.quantity);
      return true;
    });

  return tiers.length > 0 ? tiers : fallbackTiers;
}
function toPositiveInteger(value, fallback) {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}
