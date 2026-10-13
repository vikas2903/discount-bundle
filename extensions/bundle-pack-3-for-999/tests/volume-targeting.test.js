import { describe, expect, test } from "vitest";
import { runVolumeDiscount } from "../src/volume_discount";

function run(config, options = {}) {
  return runVolumeDiscount(
    {
      cart: {
        buyerIdentity:
          options.orders === undefined
            ? null
            : { customer: { numberOfOrders: options.orders } },
        lines: [
          {
            id: "line-in-collection",
            quantity: 2,
            cost: { amountPerQuantity: { amount: "20" } },
            merchandise: {
              product: { id: "product-1", inSelectedCollections: true },
            },
          },
          {
            id: "line-outside-collection",
            quantity: 2,
            cost: { amountPerQuantity: { amount: "50" } },
            merchandise: {
              product: { id: "product-2", inSelectedCollections: false },
            },
          },
        ],
      },
    },
    JSON.stringify({
      message: "Quantity saving",
      tiers: [{ minQty: 2, discountType: "percentage", discountValue: 10 }],
      ...config,
    }),
  );
}

function targetedLineIds(result) {
  return result.operations[0]?.productDiscountsAdd?.candidates.map(
    (candidate) => candidate.targets[0].cartLine.id,
  );
}

describe("volume discount targeting", () => {
  test("targets every product when the whole store is selected", () => {
    expect(targetedLineIds(run({ productMode: "all" }))).toEqual([
      "line-in-collection",
      "line-outside-collection",
    ]);
  });

  test("targets only products from selected collections", () => {
    expect(
      targetedLineIds(
        run({
          productMode: "collections",
          selectedCollectionIds: ["gid://shopify/Collection/1"],
        }),
      ),
    ).toEqual(["line-in-collection"]);
  });

  test("combines different variants and products from one collection", () => {
    const result = runVolumeDiscount(
      {
        cart: {
          lines: [
            { id: "variant-a", quantity: 1, cost: { amountPerQuantity: { amount: "20" } }, merchandise: { product: { id: "product-a", inSelectedCollections: true } } },
            { id: "variant-b", quantity: 1, cost: { amountPerQuantity: { amount: "30" } }, merchandise: { product: { id: "product-b", inSelectedCollections: true } } },
          ],
        },
      },
      JSON.stringify({
        productMode: "collections",
        selectedCollectionIds: ["gid://shopify/Collection/1"],
        application: { method: "repeat", priority: "cheapest" },
        tiers: [{ minQty: 2, discountType: "percentage", discountValue: 10 }],
      }),
    );

    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.targets.map((target) => target.cartLine.id)).toEqual(["variant-a", "variant-b"]);
    expect(candidate.value.percentage.value).toBe("10.00");
  });

  test("targets only explicitly selected products", () => {
    expect(
      targetedLineIds(
        run({ productMode: "products", selectedProductIds: ["product-2"] }),
      ),
    ).toEqual(["line-outside-collection"]);
  });

  test("keeps existing collection-only configurations working", () => {
    expect(
      targetedLineIds(
        run({ selectedCollectionIds: ["gid://shopify/Collection/1"] }),
      ),
    ).toEqual(["line-in-collection"]);
  });

  test("uses item priority when applications are limited", () => {
    expect(
      targetedLineIds(
        run({
          productMode: "all",
          application: { method: "once", priority: "most_expensive" },
        }),
      ),
    ).toEqual(["line-outside-collection"]);
  });

  test("new-customer offers require an identified customer with zero orders", () => {
    const config = {
      newCustomersOnly: true,
      productMode: "all",
      tiers: [{ minQty: 2, discountType: "percentage", discountValue: 10 }],
    };
    expect(run(config).operations).toEqual([]);
    expect(run(config, { orders: 1 }).operations).toEqual([]);
    expect(targetedLineIds(run(config, { orders: 0 }))).toHaveLength(2);
  });
});
