import assert from "node:assert/strict";
import test from "node:test";
import { validateDiscountCode } from "../app/services/discount-code.server.js";

function adminFor(payload) {
  return { graphql: async () => Response.json(payload) };
}

test("blocks a new coupon code that already belongs to any store discount", async () => {
  const result = await validateDiscountCode(
    adminFor({ data: { codeDiscountNodeByCode: { id: "gid://shopify/DiscountCodeNode/1" } } }),
    "SAVE10",
  );

  assert.equal(result.ok, false);
  assert.match(result.userErrors[0].message, /already exists/i);
});

test("allows a code only when Shopify confirms it is unused", async () => {
  const result = await validateDiscountCode(
    adminFor({ data: { codeDiscountNodeByCode: null } }),
    "SAVE10",
  );

  assert.deepEqual(result, { ok: true, userErrors: [], graphqlErrors: [] });
});

test("fails closed when Shopify cannot check a coupon code", async () => {
  const result = await validateDiscountCode(
    adminFor({ errors: [{ message: "Access denied" }] }),
    "SAVE10",
  );

  assert.equal(result.ok, false);
  assert.equal(result.graphqlErrors[0].message, "Access denied");
});

test("allows an existing offer to keep its own coupon code", async () => {
  const id = "gid://shopify/DiscountCodeNode/1";
  const result = await validateDiscountCode(
    adminFor({ data: { codeDiscountNodeByCode: { id } } }),
    "SAVE10",
    id,
  );

  assert.equal(result.ok, true);
});
