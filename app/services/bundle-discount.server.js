import {
  BUNDLE_METAFIELD_KEY,
  BUNDLE_METAFIELD_NAMESPACE,
  DEFAULT_FUNCTION_HANDLE,
  formatBundleDiscountInput,
  isBundleConfig,
  parseBundleConfig,
} from "../utils/bundle-discount";

export async function getBundleCollections(admin) {
  const collections = [];
  const graphqlErrors = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query BundleCollections($after: String) {
          collections(first: 250, after: $after, sortKey: TITLE) {
            edges {
              cursor
              node {
                id
                title
                handle
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }`,
      {
        variables: {
          after: cursor,
        },
      },
    );
    const responseJson = await response.json();
    const edges = responseJson.data?.collections?.edges || [];

    collections.push(...edges.map(({ node }) => node));
    graphqlErrors.push(...(responseJson.errors || []));

    hasNextPage = Boolean(responseJson.data?.collections?.pageInfo?.hasNextPage);
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    if (!cursor) {
      hasNextPage = false;
    }
  }

  return {
    collections,
    graphqlErrors,
  };
}

export async function listBundleDiscounts(admin) {
  const response = await admin.graphql(
    `#graphql
      query ExistingBundleDiscounts {
        discountNodes(
          first: 100
          query: "method:automatic type:app"
          sortKey: UPDATED_AT
          reverse: true
        ) {
          edges {
            node {
              id
              metafield(
                namespace: "${BUNDLE_METAFIELD_NAMESPACE}"
                key: "${BUNDLE_METAFIELD_KEY}"
              ) {
                value
              }
              discount {
                ... on DiscountAutomaticApp {
                  discountId
                  title
                  status
                  startsAt
                  endsAt
                }
              }
            }
          }
        }
      }`,
  );
  const responseJson = await response.json();

  return {
    discounts: parseDiscountNodes(responseJson.data?.discountNodes?.edges),
    graphqlErrors: responseJson.errors || [],
  };
}

export async function getBundleDiscount(admin, discountNodeId) {
  const { discounts, graphqlErrors } = await listBundleDiscounts(admin);

  return {
    discount: discounts.find((entry) => entry.nodeId === discountNodeId) || null,
    graphqlErrors,
  };
}

export async function createBundleDiscount(
  admin,
  { title, startsAt, endsAt, functionHandle, config },
) {
  const response = await admin.graphql(
    `#graphql
      mutation CreateBundleDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          userErrors {
            field
            message
          }
          automaticAppDiscount {
            discountId
            title
            status
            startsAt
            endsAt
          }
        }
      }`,
    {
      variables: {
        automaticAppDiscount: formatBundleDiscountInput({
          title,
          startsAt,
          endsAt,
          functionHandle,
          config,
        }),
      },
    },
  );
  const responseJson = await response.json();
  const payload = responseJson.data?.discountAutomaticAppCreate;

  return {
    ok:
      (payload?.userErrors || []).length === 0 &&
      Boolean(payload?.automaticAppDiscount),
    discount: payload?.automaticAppDiscount || null,
    userErrors: payload?.userErrors || [],
    graphqlErrors: responseJson.errors || [],
  };
}

export async function updateBundleDiscount(
  admin,
  { id, title, startsAt, endsAt, functionHandle, config, previousConfig },
) {
  const response = await admin.graphql(
    `#graphql
      mutation UpdateBundleDiscount(
        $id: ID!
        $automaticAppDiscount: DiscountAutomaticAppInput!
      ) {
        discountAutomaticAppUpdate(
          id: $id
          automaticAppDiscount: $automaticAppDiscount
        ) {
          userErrors {
            field
            message
          }
          automaticAppDiscount {
            discountId
            title
            status
            startsAt
            endsAt
          }
        }
      }`,
    {
      variables: {
        id,
        automaticAppDiscount: formatBundleDiscountInput({
          title,
          startsAt,
          endsAt,
          functionHandle,
          config,
          previousConfig,
        }),
      },
    },
  );
  const responseJson = await response.json();
  const payload = responseJson.data?.discountAutomaticAppUpdate;

  return {
    ok:
      (payload?.userErrors || []).length === 0 &&
      Boolean(payload?.automaticAppDiscount),
    discount: payload?.automaticAppDiscount || null,
    userErrors: payload?.userErrors || [],
    graphqlErrors: responseJson.errors || [],
  };
}

export async function toggleBundleDiscountStatus(admin, { id, nextStatus }) {
  const mutationName =
    nextStatus === "disable"
      ? "discountAutomaticDeactivate"
      : "discountAutomaticActivate";
  const response = await admin.graphql(
    `#graphql
      mutation ToggleBundleDiscount($id: ID!) {
        ${mutationName}(id: $id) {
          automaticDiscountNode {
            automaticDiscount {
              ... on DiscountAutomaticApp {
                discountId
                title
                status
                startsAt
                endsAt
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: { id },
    },
  );
  const responseJson = await response.json();
  const payload = responseJson.data?.[mutationName];

  return {
    ok:
      (payload?.userErrors || []).length === 0 &&
      Boolean(payload?.automaticDiscountNode?.automaticDiscount),
    discount: payload?.automaticDiscountNode?.automaticDiscount || null,
    userErrors: payload?.userErrors || [],
    graphqlErrors: responseJson.errors || [],
    nextStatus,
  };
}

export async function deleteBundleDiscount(admin, id) {
  const response = await admin.graphql(
    `#graphql
      mutation DeleteBundleDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: { id },
    },
  );
  const responseJson = await response.json();
  const payload = responseJson.data?.discountAutomaticDelete;

  return {
    ok:
      (payload?.userErrors || []).length === 0 &&
      Boolean(payload?.deletedAutomaticDiscountId),
    deletedAutomaticDiscountId: payload?.deletedAutomaticDiscountId || null,
    userErrors: payload?.userErrors || [],
    graphqlErrors: responseJson.errors || [],
  };
}

export function resolveFunctionHandle() {
  const env = process.env ?? {};

  return env.SHOPIFY_BUNDLE_FUNCTION_HANDLE || DEFAULT_FUNCTION_HANDLE;
}

function parseDiscountNodes(edges = []) {
  return edges
    .map(({ node }) => {
      const configValue = node.metafield?.value;
      const automaticDiscount = node.discount;

      if (!configValue || !automaticDiscount?.discountId) {
        return null;
      }

      return {
        // Shopify mutations for automatic discounts require the
        // DiscountAutomaticNode ID, not DiscountAutomaticApp.discountId.
        nodeId: node.id,
        adminGraphqlNodeId: node.id,
        discountId: automaticDiscount.discountId,
        title: automaticDiscount.title,
        status: automaticDiscount.status,
        startsAt: automaticDiscount.startsAt,
        endsAt: automaticDiscount.endsAt,
        config: parseBundleConfig(configValue),
      };
    })
    .filter((entry) => entry && isBundleConfig(entry.config))
    .filter(Boolean);
}
