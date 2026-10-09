import { describe, expect, test } from "vitest";
import { runVolumeDiscount } from "../src/volume_discount";

function run(config) {
  return runVolumeDiscount(
    {
      cart: {
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
});
