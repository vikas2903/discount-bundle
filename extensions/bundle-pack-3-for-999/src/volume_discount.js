import {ProductDiscountSelectionStrategy} from '../generated/api';

export function runVolumeDiscount(input, configValue) {
  const config = parseVolumeConfig(configValue);
  const candidates = [];

  if (config.mode === 'legacy-product') {
    return runLegacyProductVolumeDiscount(input, config);
  }

  const qualifyingLines = [];
  for (const line of input.cart.lines) {
    const productId = line.merchandise?.product?.id;
    if (!productId) {
      continue;
    }

    const appliesToAllProducts = config.productMode === 'all';
    const inSelectedCollections =
      line.merchandise?.product?.inSelectedCollections === true;
    const isSelectedProduct = config.selectedProductIds.includes(productId);

    if (
      !appliesToAllProducts &&
      !(config.productMode === 'collections' && inSelectedCollections) &&
      !(config.productMode === 'products' && isSelectedProduct)
    ) {
      continue;
    }

    const matchedTier = [...config.tiers]
      .sort((left, right) => right.minQty - left.minQty)
      .find((tier) => Number(line.quantity || 0) >= tier.minQty);

    if (!matchedTier) {
      continue;
    }

    qualifyingLines.push({line, matchedTier});
  }

  if (config.newCustomersOnly && input.cart.buyerIdentity?.customer?.numberOfOrders !== 0) {
    return {operations: []};
  }

  const direction = config.application.priority === 'most_expensive' ? -1 : 1;
  qualifyingLines.sort(
    (left, right) =>
      direction * (linePrice(left.line) - linePrice(right.line)),
  );
  const applicationLimit =
    config.application.method === 'once'
      ? 1
      : config.application.method === 'limit'
        ? config.application.maxApplications
        : Infinity;

  for (const {line, matchedTier} of qualifyingLines.slice(0, applicationLimit)) {
    if (matchedTier.discountType === 'fixed') {
      candidates.push({
        message: resolveVolumeMessage(config.message, matchedTier.label),
        targets: [{cartLine: {id: line.id, quantity: matchedTier.minQty}}],
        value: {
          fixedAmount: {
            amount: matchedTier.discountValue.toFixed(2),
            appliesToEachItem: true,
          },
        },
      });
    } else {
      candidates.push({
        message: resolveVolumeMessage(config.message, matchedTier.label),
        targets: [{cartLine: {id: line.id, quantity: matchedTier.minQty}}],
        value: {
          percentage: {
            value: matchedTier.discountValue.toFixed(2),
          },
        },
      });
    }
  }

  if (!candidates.length) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

function parseVolumeConfig(value) {
  const fallback = {
    message: 'Volume discount applied',
    selectedCollectionIds: [],
    selectedProductIds: [],
    productMode: 'all',
    newCustomersOnly: false,
    application: {method: 'repeat', maxApplications: 0, priority: 'cheapest'},
    tiers: [],
    mode: 'collection',
    products: [],
  };

  if (!value) {
    return fallback;
  }

  try {
    const config = JSON.parse(value);

    return {
      message:
        typeof config.message === 'string' && config.message.trim()
          ? config.message.trim()
          : fallback.message,
      selectedCollectionIds: Array.isArray(config.selectedCollectionIds)
        ? config.selectedCollectionIds
            .map((collectionId) => String(collectionId || '').trim())
            .filter(Boolean)
        : fallback.selectedCollectionIds,
      selectedProductIds: Array.isArray(config.selectedProductIds)
        ? config.selectedProductIds
            .map((productId) => String(productId || '').trim())
            .filter(Boolean)
        : fallback.selectedProductIds,
      productMode: resolveProductMode(
        config.productMode,
        config.selectedCollectionIds,
        config.selectedProductIds,
      ),
      newCustomersOnly: Boolean(config.newCustomersOnly),
      application: {
        method: ['once', 'limit', 'repeat'].includes(config.application?.method)
          ? config.application.method
          : fallback.application.method,
        maxApplications: toNonNegativeInteger(config.application?.maxApplications, 0),
        priority:
          config.application?.priority === 'most_expensive'
            ? 'most_expensive'
            : 'cheapest',
      },
      tiers: Array.isArray(config.tiers)
        ? config.tiers
            .map((tier) => ({
              minQty: toPositiveInteger(tier?.minQty, 2),
              discountType:
                tier?.discountType === 'fixed' ? 'fixed' : 'percentage',
              discountValue: toPositiveNumber(tier?.discountValue, 0),
              label: typeof tier?.label === 'string' ? tier.label : '',
            }))
            .filter(
              (tier) =>
                tier.discountValue > 0 &&
                (tier.discountType !== 'percentage' || tier.discountValue <= 100),
            )
        : fallback.tiers,
      mode: Array.isArray(config.tiers) && config.tiers.length > 0
        ? 'collection'
        : 'legacy-product',
      products: Array.isArray(config.products)
        ? config.products.map((product) => ({
            productId:
              typeof product?.productId === 'string' ? product.productId : '',
            tiers: Array.isArray(product?.tiers)
              ? product.tiers
                  .map((tier) => ({
                    minQty: toPositiveInteger(tier?.minQty, 2),
                    discountType:
                      tier?.discountType === 'fixed' ? 'fixed' : 'percentage',
                    discountValue: toPositiveNumber(tier?.discountValue, 0),
                    label: typeof tier?.label === 'string' ? tier.label : '',
                  }))
                  .filter(
                    (tier) =>
                      tier.discountValue > 0 &&
                      (tier.discountType !== 'percentage' || tier.discountValue <= 100),
                  )
              : [],
          }))
        : fallback.products,
    };
  } catch {
    return fallback;
  }
}

function resolveVolumeMessage(configMessage, tierLabel) {
  if (typeof tierLabel === 'string' && tierLabel.trim()) {
    return tierLabel.trim();
  }

  return configMessage;
}

function resolveProductMode(value, collectionIds, productIds) {
  if (value === 'all' || value === 'collections' || value === 'products') {
    return value;
  }

  if (Array.isArray(productIds) && productIds.length > 0) {
    return 'products';
  }

  return Array.isArray(collectionIds) && collectionIds.length > 0
    ? 'collections'
    : 'all';
}

function runLegacyProductVolumeDiscount(input, config) {
  const candidates = [];

  for (const line of input.cart.lines) {
    const productId = line.merchandise?.product?.id;

    if (!productId) {
      continue;
    }

    const productRule = config.products.find((product) => product.productId === productId);

    if (!productRule) {
      continue;
    }

    const matchedTier = [...productRule.tiers]
      .sort((left, right) => right.minQty - left.minQty)
      .find((tier) => Number(line.quantity || 0) >= tier.minQty);

    if (!matchedTier) {
      continue;
    }

    if (matchedTier.discountType === 'fixed') {
      candidates.push({
        message: resolveVolumeMessage(config.message, matchedTier.label),
        targets: [{cartLine: {id: line.id, quantity: matchedTier.minQty}}],
        value: {
          fixedAmount: {
            amount: matchedTier.discountValue.toFixed(2),
            appliesToEachItem: true,
          },
        },
      });

      continue;
    }

    candidates.push({
      message: resolveVolumeMessage(config.message, matchedTier.label),
      targets: [{cartLine: {id: line.id, quantity: matchedTier.minQty}}],
      value: {
        percentage: {
          value: matchedTier.discountValue.toFixed(2),
        },
      },
    });
  }

  if (!candidates.length) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
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

function linePrice(line) {
  const price = Number(line.cost?.amountPerQuantity?.amount || 0);

  return Number.isFinite(price) ? price : 0;
}
