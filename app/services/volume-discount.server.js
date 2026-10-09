import { getBundleCollections } from "./bundle-discount.server";
import {
  DEFAULT_VOLUME_FUNCTION_HANDLE,
  formatVolumeDiscountInput,
  parseVolumeConfig,
  VOLUME_METAFIELD_KEY,
  VOLUME_METAFIELD_NAMESPACE,
} from "../utils/volume-discount";

export { getBundleCollections as getVolumeCollections };

export async function getVolumeProducts(admin) {
  const products = [];
  const graphqlErrors = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query VolumeProducts($after: String) {
          products(first: 250, after: $after, sortKey: TITLE) {
            edges {
              cursor
              node {
                id
                title
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }`,
      { variables: { after: cursor } },
    );
    const responseJson = await response.json();
    const edges = responseJson.data?.products?.edges || [];

    products.push(...edges.map(({ node }) => node));
    graphqlErrors.push(...(responseJson.errors || []));
    hasNextPage = Boolean(responseJson.data?.products?.pageInfo?.hasNextPage);
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    if (!cursor) {
      hasNextPage = false;
    }
  }

  return { products, graphqlErrors };
}

export async function listVolumeDiscounts(admin) {
  const response = await admin.graphql(
    `#graphql
      query ExistingVolumeDiscounts {
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
                namespace: "${VOLUME_METAFIELD_NAMESPACE}"
                key: "${VOLUME_METAFIELD_KEY}"
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
    discounts:
      responseJson.data?.discountNodes?.edges
        ?.map(({ node }) => {
          const configValue = node.metafield?.value;
          const automaticDiscount = node.discount;

          if (!configValue || !automaticDiscount?.discountId) {
            return null;
          }

          return {
            nodeId: automaticDiscount.discountId,
            adminGraphqlNodeId: node.id,
            discountId: automaticDiscount.discountId,
            title: automaticDiscount.title,
            status: automaticDiscount.status,
            startsAt: automaticDiscount.startsAt,
            endsAt: automaticDiscount.endsAt,
            config: parseVolumeConfig(configValue),
          };
        })
        .filter(Boolean) || [],
    graphqlErrors: responseJson.errors || [],
  };
}

export async function createVolumeDiscount(
  admin,
  { title, startsAt, endsAt, functionHandle, config },
) {
  const response = await admin.graphql(
    `#graphql
      mutation CreateVolumeDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
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
        automaticAppDiscount: formatVolumeDiscountInput({
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

  const result = {
    ok:
      (payload?.userErrors || []).length === 0 &&
      Boolean(payload?.automaticAppDiscount),
    discount: payload?.automaticAppDiscount || null,
    userErrors: payload?.userErrors || [],
    graphqlErrors: responseJson.errors || [],
  };

  // Shopify creates automatic app discounts as active. Quantity offers default
  // to DRAFT in this app, so deactivate them immediately after creation.
  if (result.ok && config.status !== "ACTIVE") {
    const deactivation = await toggleVolumeDiscountStatus(admin, {
      id: result.discount.discountId,
      nextStatus: "disable",
    });

    if (!deactivation.ok) {
      return {
        ...result,
        ok: false,
        userErrors: deactivation.userErrors,
        graphqlErrors: deactivation.graphqlErrors,
      };
    }

    return {
      ...result,
      discount: deactivation.discount || result.discount,
      nextStatus: "disable",
    };
  }

  return result;
}

export async function updateVolumeDiscount(
  admin,
  { id, title, startsAt, endsAt, functionHandle, config },
) {
  const response = await admin.graphql(
    `#graphql
      mutation UpdateVolumeDiscount(
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
        automaticAppDiscount: formatVolumeDiscountInput({
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

export async function toggleVolumeDiscountStatus(admin, { id, nextStatus }) {
  const mutationName =
    nextStatus === "disable"
      ? "discountAutomaticDeactivate"
      : "discountAutomaticActivate";
  const response = await admin.graphql(
    `#graphql
      mutation ToggleVolumeDiscount($id: ID!) {
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
    { variables: { id } },
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

export async function deleteVolumeDiscount(admin, id) {
  const response = await admin.graphql(
    `#graphql
      mutation DeleteVolumeDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors {
            field
            message
          }
        }
      }`,
    { variables: { id } },
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

export function resolveVolumeFunctionHandle() {
  const env = process.env ?? {};

  return env.SHOPIFY_BUNDLE_FUNCTION_HANDLE || DEFAULT_VOLUME_FUNCTION_HANDLE;
}
