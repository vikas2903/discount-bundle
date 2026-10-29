/**
 * Protects every coupon creation flow. Shopify's lookup is case-insensitive,
 * so a merchant cannot accidentally create a code that already belongs to a
 * Shopify-admin or another-app discount on the same store.
 */
export async function getDiscountCodeConflict(admin, code) {
  const normalizedCode = String(code || "").trim();

  if (!normalizedCode) {
    return { id: null, exists: false, graphqlErrors: [] };
  }

  const response = await admin.graphql(
    `#graphql
      query ExistingDiscountCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          id
        }
      }`,
    { variables: { code: normalizedCode } },
  );
  const responseJson = await response.json();

  return {
    id: responseJson.data?.codeDiscountNodeByCode?.id || null,
    exists: Boolean(responseJson.data?.codeDiscountNodeByCode?.id),
    graphqlErrors: responseJson.errors || [],
  };
}

export async function validateDiscountCode(admin, code, currentDiscountId = null) {
  const result = await getDiscountCodeConflict(admin, code);

  if (result.graphqlErrors.length > 0) {
    return { ok: false, userErrors: [], graphqlErrors: result.graphqlErrors };
  }

  if (result.exists && result.id !== currentDiscountId) {
    return {
      ok: false,
      userErrors: [{ field: ["code"], message: "This coupon code already exists in this store. Choose a different code." }],
      graphqlErrors: [],
    };
  }

  return { ok: true, userErrors: [], graphqlErrors: [] };
}
