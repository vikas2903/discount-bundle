import {OrderDiscountSelectionStrategy, ProductDiscountSelectionStrategy} from '../generated/api';

export function isBundleDiscountConfig(value) {
  try { return Array.isArray(JSON.parse(value)?.bundleTiers); } catch { return false; }
}

export function runBundleDiscount(input, configValue) {
  const config = parseConfig(configValue);
  if (!config.bundleTiers.length || !meetsEligibility(input, config)) return {operations: []};
  // Existing automatic discounts were created as ORDER discounts. Keep their
  // old behaviour until a merchant saves them in the upgraded builder.
  if (config.version < 2 || !input.discount.discountClasses.includes('PRODUCT')) {
    return runLegacyOrderDiscount(input, config);
  }
  return runProductBundleDiscount(input, config);
}

function runProductBundleDiscount(input, config) {
  const units = eligibleUnits(input, config);
  if (units.length < config.eligibility.minimumQuantity) return {operations: []};
  const direction = config.application.priority === 'most_expensive' ? -1 : 1;
  units.sort((left, right) => direction * (left.price - right.price));
  const rules = rulesFor(config);
  const candidates = [];
  const perTierApplications = new Map();
  let cursor = 0;
  let appliedBundles = 0;
  let appliedItems = 0;
  const maxBundles = config.application.method === 'once' ? 1 : config.application.method === 'limit_bundles' ? config.application.maxBundles : Infinity;
  const maxItems = config.application.method === 'limit_items' ? config.application.maxDiscountedItems : Infinity;

  while (cursor < units.length && appliedBundles < maxBundles) {
    const rule = rules.find((candidate) => {
      const used = perTierApplications.get(candidate.key) || 0;
      return candidate.groupSize <= units.length - cursor && candidate.groupSize <= maxItems - appliedItems && (!candidate.maxBundles || used < candidate.maxBundles);
    });
    if (!rule) { cursor += 1; continue; }
    const group = units.slice(cursor, cursor + rule.groupSize);
    const targets = toTargets(rule.discountType === 'free' ? group.slice(0, rule.freeQuantity) : group);
    const subtotal = group.reduce((sum, unit) => sum + unit.price, 0);
    const fixedSaving = rule.discountType === 'fixed_price' ? Math.max(0, subtotal - rule.value) : 0;
    if (!targets.length || (rule.discountType === 'fixed_price' && fixedSaving <= 0)) { cursor += 1; continue; }
    candidates.push({
      message: config.message,
      targets,
      value: rule.discountType === 'percentage'
        ? {percentage: {value: rule.value.toFixed(2)}}
        : rule.discountType === 'free'
          ? {percentage: {value: '100.00'}}
          : {fixedAmount: {amount: fixedSaving.toFixed(2), appliesToEachItem: false}},
    });
    perTierApplications.set(rule.key, (perTierApplications.get(rule.key) || 0) + 1);
    cursor += rule.groupSize;
    appliedBundles += 1;
    appliedItems += rule.groupSize;
  }
  if (!candidates.length) return {operations: []};
  return {operations: [{productDiscountsAdd: {candidates, selectionStrategy: ProductDiscountSelectionStrategy.All}}]};
}

function runLegacyOrderDiscount(input, config) {
  const units = eligibleUnits(input, config).sort((left, right) => right.price - left.price);
  const rules = rulesFor(config);
  let amount = 0; let cursor = 0; const discountedLineIds = new Set();
  while (cursor < units.length) {
    const rule = rules.find((candidate) => candidate.groupSize <= units.length - cursor);
    if (!rule) { cursor += 1; continue; }
    const group = units.slice(cursor, cursor + rule.groupSize);
    const subtotal = group.reduce((sum, unit) => sum + unit.price, 0);
    const saving = rule.discountType === 'free' ? group.slice(-rule.freeQuantity).reduce((sum, unit) => sum + unit.price, 0) : rule.discountType === 'percentage' ? subtotal * rule.value / 100 : subtotal - rule.value;
    if (saving <= 0) { cursor += 1; continue; }
    amount += saving; group.forEach((unit) => discountedLineIds.add(unit.cartLineId)); cursor += rule.groupSize;
  }
  if (amount <= 0) return {operations: []};
  return {operations: [{orderDiscountsAdd: {candidates: [{message: config.message, targets: [{orderSubtotal: {excludedCartLineIds: input.cart.lines.filter((line) => !discountedLineIds.has(line.id)).map((line) => line.id)}}], value: {fixedAmount: {amount: amount.toFixed(2)}}}], selectionStrategy: OrderDiscountSelectionStrategy.First}}]};
}

function rulesFor(config) {
  return config.bundleTiers.map((tier) => ({...tier, groupSize: tier.quantity + (tier.discountType === 'free' ? tier.freeQuantity : 0), key: `${tier.quantity}:${tier.discountType}:${tier.value}:${tier.freeQuantity}`})).sort((left, right) => right.groupSize - left.groupSize || right.quantity - left.quantity);
}

function eligibleUnits(input, config) {
  const result = [];
  for (const line of input.cart.lines) {
    const product = line.merchandise?.product;
    if (!product || !matchesProduct(product, config)) continue;
    const price = Number(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(price) || price <= 0) continue;
    for (let index = 0; index < line.quantity; index += 1) result.push({cartLineId: line.id, price});
  }
  return result;
}

function matchesProduct(product, config) {
  const eligibility = config.eligibility;
  if (eligibility.excludedProductIds.includes(product.id)) return false;
  if (eligibility.productMode === 'products') return eligibility.selectedProductIds.includes(product.id);
  if (eligibility.productMode === 'collections') return Boolean(product.inSelectedCollections);
  return true;
}

function meetsEligibility(input, config) {
  const cartValue = Number(input.cart.cost?.subtotalAmount?.amount || 0);
  if (config.eligibility.minimumCartValue > 0 && cartValue < config.eligibility.minimumCartValue) return false;
  if (config.eligibility.newCustomersOnly && input.cart.buyerIdentity?.customer?.numberOfOrders !== 0) return false;
  return true;
}

function toTargets(units) {
  const quantities = new Map();
  units.forEach((unit) => quantities.set(unit.cartLineId, (quantities.get(unit.cartLineId) || 0) + 1));
  return [...quantities].map(([id, quantity]) => ({cartLine: {id, quantity}}));
}

function parseConfig(value) {
  const fallback = {version: 1, bundleTiers: [], eligibility: {productMode: 'all', selectedCollectionIds: [], selectedProductIds: [], excludedProductIds: [], minimumCartValue: 0, minimumQuantity: 0, newCustomersOnly: false}, application: {method: 'once', maxBundles: 1, maxDiscountedItems: 0, priority: 'cheapest'}, message: 'Bundle Discount Applied'};
  try {
    const raw = JSON.parse(value); const legacyCollections = Array.isArray(raw.selectedCollectionIds) ? raw.selectedCollectionIds : [];
    const eligibility = raw.eligibility || {};
    const tiers = (Array.isArray(raw.bundleTiers) ? raw.bundleTiers : []).map((tier) => ({quantity: integer(tier.quantity, 0), freeQuantity: integer(tier.freeQuantity, 0), discountType: ['percentage', 'free'].includes(tier.discountType) ? tier.discountType : 'fixed_price', value: decimal(tier.value ?? tier.price, 0), maxBundles: integer(tier.maxBundles, 0)})).filter((tier) => tier.quantity >= 2 && (tier.discountType === 'free' ? tier.freeQuantity > 0 : tier.value > 0) && (tier.discountType !== 'percentage' || tier.value <= 100));
    return {
      version: Number(raw.version) >= 2 ? 2 : 1, bundleTiers: tiers,
      eligibility: {productMode: ['collections', 'products'].includes(eligibility.productMode) ? eligibility.productMode : legacyCollections.length ? 'collections' : 'all', selectedCollectionIds: ids(eligibility.selectedCollectionIds ?? legacyCollections), selectedProductIds: ids(eligibility.selectedProductIds), excludedProductIds: ids(eligibility.excludedProductIds), minimumCartValue: decimal(eligibility.minimumCartValue, 0), minimumQuantity: integer(eligibility.minimumQuantity, 0), newCustomersOnly: Boolean(eligibility.newCustomersOnly)},
      application: {method: ['once', 'repeat', 'limit_bundles', 'limit_items'].includes(raw.application?.method) ? raw.application.method : 'once', maxBundles: integer(raw.application?.maxBundles, 0), maxDiscountedItems: integer(raw.application?.maxDiscountedItems, 0), priority: raw.application?.priority === 'most_expensive' ? 'most_expensive' : 'cheapest'},
      message: typeof raw.messages?.confirmation === 'string' && raw.messages.confirmation.trim() ? raw.messages.confirmation.trim() : typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : fallback.message,
    };
  } catch { return fallback; }
}
function ids(value) { return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []; }
function integer(value, fallback) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function decimal(value, fallback) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
