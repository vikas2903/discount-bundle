import assert from "node:assert/strict";
import test from "node:test";
import { isBundleConfigValue } from "../app/utils/bundle-discount.js";
import {
  formatVolumeDiscountInput,
  VOLUME_METAFIELD_NAMESPACE,
} from "../app/utils/volume-discount.js";

test("does not classify a legacy volume compatibility value as a bundle offer", () => {
  assert.equal(
    isBundleConfigValue(JSON.stringify({ productMode: "all", selectedProductIds: [] })),
    false,
  );
});

test("recognizes a real bundle offer", () => {
  assert.equal(
    isBundleConfigValue(JSON.stringify({ bundleTiers: [{ quantity: 2, value: 10 }] })),
    true,
  );
});

test("new volume offers write only their own configuration metafield", () => {
  const input = formatVolumeDiscountInput({
    config: {
      title: "Volume",
      selectedCollectionIds: [],
      selectedProductIds: [],
      productMode: "all",
      combinations: {},
    },
  });

  assert.deepEqual(input.metafields.map(({ namespace }) => namespace), [VOLUME_METAFIELD_NAMESPACE]);
});
