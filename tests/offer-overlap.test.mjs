import assert from "node:assert/strict";
import test from "node:test";
import { offerTargetsOverlap } from "../app/utils/offer-overlap.js";
import { localDateTimeToIso } from "../app/utils/date-time.js";

test("detects overlap between matching selected products", () => {
  assert.equal(
    offerTargetsOverlap(
      { productMode: "products", selectedProductIds: ["p-1"] },
      { eligibility: { productMode: "products", selectedProductIds: ["p-1"] } },
    ),
    true,
  );
});

test("detects legacy product offers overlapping a selected product", () => {
  assert.equal(
    offerTargetsOverlap(
      { productMode: "products", selectedProductIds: ["p-1"] },
      {
        mode: "legacy-product",
        legacyProducts: [{ productId: "p-1" }, { productId: "p-2" }],
      },
    ),
    true,
  );
  assert.equal(
    offerTargetsOverlap(
      { productMode: "products", selectedProductIds: ["p-3"] },
      {
        mode: "legacy-product",
        legacyProducts: [{ productId: "p-1" }, { productId: "p-2" }],
      },
    ),
    false,
  );
});

test("treats product-to-collection scopes conservatively", () => {
  assert.equal(
    offerTargetsOverlap(
      { productMode: "products", selectedProductIds: ["p-1"] },
      { productMode: "collections", selectedCollectionIds: ["c-1"] },
    ),
    true,
  );
});

test("converts a browser-local date-time to UTC without shifting its local wall time", () => {
  const iso = localDateTimeToIso("2026-10-09T09:30");
  const converted = new Date(iso);

  assert.equal(iso, converted.toISOString());
  assert.equal(converted.getFullYear(), 2026);
  assert.equal(converted.getMonth(), 9);
  assert.equal(converted.getDate(), 9);
  assert.equal(converted.getHours(), 9);
  assert.equal(converted.getMinutes(), 30);
  assert.equal(localDateTimeToIso(""), "");
});
