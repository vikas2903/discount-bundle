import {OrderDiscountSelectionStrategy} from '../generated/api';

export function runBundleDiscount(input, configValue) {
  const config = parseBundleConfig(configValue);
  const bundleRules = [...config.bundleTiers]
    .map((tier) => ({
      quantity: tier.quantity,
      freeQuantity: tier.freeQuantity || 0,
      discountType: tier.discountType,
      value: tier.value,
    }))
    .filter((rule) => rule.quantity >= 2 && (rule.discountType === 'free' ? rule.freeQuantity > 0 : rule.value > 0))
    .sort((left, right) => (right.quantity + right.freeQuantity) - (left.quantity + left.freeQuantity));

  if (!bundleRules.length) {
    return {operations: []};
  }

  const eligibleUnits = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;

    if (!merchandise?.product) {
      continue;
    }

    const matchesCollection =
      config.selectedCollectionIds.length === 0 ||
      merchandise.product.inSelectedCollections;

    if (!matchesCollection) {
      continue;
    }

    const unitPrice = Number(line.cost.amountPerQuantity.amount);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      continue;
    }

    for (let index = 0; index < line.quantity; index += 1) {
      eligibleUnits.push({cartLineId: line.id, price: unitPrice});
    }
  }

  eligibleUnits.sort((left, right) => right.price - left.price);

  let discountAmount = 0;
  let unitIndex = 0;
  const discountedCartLineIds = new Set();

  while (unitIndex < eligibleUnits.length) {
    let appliedRule = false;

    for (const rule of bundleRules) {
      const requiredUnits = rule.quantity + rule.freeQuantity;
      const bundleUnits = eligibleUnits.slice(
        unitIndex,
        unitIndex + requiredUnits,
      );

      if (bundleUnits.length !== requiredUnits) {
        continue;
      }

      const bundleSubtotal = bundleUnits.reduce(
        (total, unit) => total + unit.price,
        0,
      );
      const bundleDiscount = rule.discountType === 'free'
        ? bundleUnits.slice(-rule.freeQuantity).reduce((total, unit) => total + unit.price, 0)
        : rule.discountType === 'percentage'
        ? bundleSubtotal * (rule.value / 100)
        : bundleSubtotal - rule.value;

      if (bundleDiscount > 0) {
        discountAmount += bundleDiscount;

        for (const unit of bundleUnits) {
          discountedCartLineIds.add(unit.cartLineId);
        }

        unitIndex += requiredUnits;
        appliedRule = true;
        break;
      }
    }

    if (!appliedRule) {
      unitIndex += 1;
    }
  }

  if (discountAmount <= 0) {
    return {operations: []};
  }

  const excludedCartLineIds = input.cart.lines
    .filter((line) => !discountedCartLineIds.has(line.id))
    .map((line) => line.id);

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: config.message,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds,
                  },
                },
              ],
              value: {
                fixedAmount: {
                  amount: discountAmount.toFixed(2),
                },
              },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}

function parseBundleConfig(value) {
  const fallback = {
    bundleTiers: [],
    selectedCollectionIds: [],
    message: 'Bundle Discount Applied',
  };

  if (!value) {
    return fallback;
  }

  try {
    const config = JSON.parse(value);
    const bundleTiers = normalizeBundleTiers(config.bundleTiers, []);

    return {
      bundleTiers,
      selectedCollectionIds: Array.isArray(config.selectedCollectionIds)
        ? config.selectedCollectionIds.filter((id) => typeof id === 'string')
        : [],
      message:
        typeof config.message === 'string' && config.message.trim()
          ? config.message.trim()
          : fallback.message,
    };
  } catch {
    return fallback;
  }
}

function toPositiveNumber(value, fallback) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function toPositiveInteger(value, fallback) {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0
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
      discountType: ['percentage', 'free'].includes(tier?.discountType) ? tier.discountType : 'fixed_price',
      value: toPositiveNumber(tier?.value ?? tier?.price, 0),
    }))
    .filter((tier) => tier.quantity >= 2 && (tier.discountType === 'free' ? tier.freeQuantity > 0 : tier.value > 0) && (tier.discountType !== 'percentage' || tier.value <= 100))
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
