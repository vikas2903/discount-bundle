import { describe, expect, test } from "vitest";
import { runBundleDiscount } from "../src/bundle_discount";

const baseConfig = {
  version: 2,
  bundleTiers: [{ quantity: 2, discountType: "fixed_price", value: 100, freeQuantity: 0, maxBundles: 0 }],
  application: { method: "once", priority: "cheapest", maxBundles: 1, maxDiscountedItems: 0 },
  eligibility: { productMode: "all", selectedCollectionIds: [], selectedProductIds: [], excludedProductIds: [], minimumCartValue: 0, minimumQuantity: 0, newCustomersOnly: false },
  messages: { confirmation: "Bundle applied" },
};

function run(config, prices, options = {}) {
  return runBundleDiscount({
    cart: {
      cost: { subtotalAmount: { amount: String(prices.reduce((sum, price) => sum + price, 0)) } },
      buyerIdentity: options.orders === undefined ? null : { customer: { numberOfOrders: options.orders } },
      lines: prices.map((price, index) => ({
        id: `line-${index}`, quantity: 1, cost: { amountPerQuantity: { amount: String(price) } },
        merchandise: { product: { id: `product-${index}`, inSelectedCollections: options.inCollection?.[index] ?? true } },
      })),
    },
    discount: { discountClasses: ["PRODUCT"] },
  }, JSON.stringify(config));
}

function candidates(result) { return result.operations[0]?.productDiscountsAdd?.candidates || []; }

describe("advanced bundle limits", () => {
  test("fixed Buy 2 targets exactly two items", () => {
    const result = run(baseConfig, [80, 70]);
    expect(candidates(result)).toHaveLength(1);
    expect(candidates(result)[0].value.fixedAmount.amount).toBe("50.00");
    expect(candidates(result)[0].targets).toHaveLength(2);
  });

  test("apply once leaves the second qualifying bundle regular", () => {
    expect(candidates(run(baseConfig, [80, 70, 60, 50]))).toHaveLength(1);
  });

  test("repeat applies every complete bundle", () => {
    const config = {...baseConfig, application: {...baseConfig.application, method: "repeat"}};
    expect(candidates(run(config, [80, 70, 60, 50]))).toHaveLength(2);
  });

  test("bundle cap applies no more than the configured number", () => {
    const config = {...baseConfig, application: {...baseConfig.application, method: "limit_bundles", maxBundles: 2}};
    expect(candidates(run(config, [80, 70, 60, 50, 40, 30]))).toHaveLength(2);
  });

  test("item cap prevents a partial third bundle", () => {
    const config = {...baseConfig, application: {...baseConfig.application, method: "limit_items", maxDiscountedItems: 4}};
    expect(candidates(run(config, [80, 70, 60, 50, 40, 30]))).toHaveLength(2);
  });

  test("priority selects cheapest or most expensive eligible items first", () => {
    const cheap = candidates(run(baseConfig, [130, 140, 190]))[0].targets.map((target) => target.cartLine.id);
    const expensive = candidates(run({...baseConfig, application: {...baseConfig.application, priority: "most_expensive"}}, [130, 140, 190]))[0].targets.map((target) => target.cartLine.id);
    expect(cheap).toEqual(["line-0", "line-1"]);
    expect(expensive).toEqual(["line-2", "line-1"]);
  });

  test("largest qualifying tier is deterministic", () => {
    const config = {...baseConfig, bundleTiers: [{quantity: 2, discountType: "fixed_price", value: 100}, {quantity: 3, discountType: "percentage", value: 20}]};
    const result = run(config, [100, 100, 100]);
    expect(candidates(result)[0].value.percentage.value).toBe("20.00");
  });

  test("percentage and buy-X-get-Y-free tiers return valid product candidates", () => {
    const percentage = run({...baseConfig, bundleTiers: [{quantity: 2, discountType: "percentage", value: 25}]}, [80, 80]);
    const free = run({...baseConfig, bundleTiers: [{quantity: 2, freeQuantity: 1, discountType: "free", value: 0}]}, [80, 70, 60]);
    expect(candidates(percentage)[0].value.percentage.value).toBe("25.00");
    expect(candidates(free)[0].targets).toHaveLength(1);
    expect(candidates(free)[0].value.percentage.value).toBe("100.00");
  });

  test("product inclusion, exclusions, cart minimum and new-customer checks are enforced", () => {
    const excluded = {...baseConfig, eligibility: {...baseConfig.eligibility, excludedProductIds: ["product-0"]}};
    const minimum = {...baseConfig, eligibility: {...baseConfig.eligibility, minimumCartValue: 999}};
    const newOnly = {...baseConfig, eligibility: {...baseConfig.eligibility, newCustomersOnly: true}};
    expect(run(excluded, [80, 70]).operations).toEqual([]);
    expect(run(minimum, [80, 70]).operations).toEqual([]);
    expect(run(newOnly, [80, 70], {orders: 1}).operations).toEqual([]);
  });
});
