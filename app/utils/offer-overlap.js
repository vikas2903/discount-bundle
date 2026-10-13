export function offerTargetsOverlap(left, right) {
  const leftTarget = getTarget(left);
  const rightTarget = getTarget(right);

  if (leftTarget.mode === "all" || rightTarget.mode === "all") {
    return true;
  }

  if (leftTarget.mode !== rightTarget.mode) {
    return true;
  }

  return leftTarget.ids.some((id) => rightTarget.ids.includes(id));
}

function getTarget(config) {
  if (config?.mode === "legacy-product") {
    const productIds = Array.isArray(config.legacyProducts)
      ? config.legacyProducts.map((product) => product.productId).filter(Boolean)
      : [];
    return { mode: "products", ids: productIds };
  }

  const eligibility = config?.eligibility || config || {};
  const productMode =
    eligibility.productMode === "products" ||
    eligibility.productMode === "collections"
      ? eligibility.productMode
      : (eligibility.selectedProductIds || []).length > 0
        ? "products"
        : (eligibility.selectedCollectionIds || []).length > 0
          ? "collections"
          : "all";
  const ids =
    productMode === "products"
      ? eligibility.selectedProductIds || []
      : productMode === "collections"
        ? eligibility.selectedCollectionIds || []
        : [];

  return { mode: productMode, ids };
}
