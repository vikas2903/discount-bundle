const DAYS_TO_LOAD = 30;
const ORDER_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 4;

export async function getShopCurrencyCode(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
      query ShopCurrency {
        shop {
          currencyCode
        }
      }`,
    );
    const result = await response.json();

    return result.data?.shop?.currencyCode || "USD";
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[analytics] Unable to load shop currency", error);

    return "USD";
  }
}

export async function getDiscountAnalytics(admin, discountIdentifiers = [], shop = "") {
  const since = new Date(Date.now() - DAYS_TO_LOAD * 24 * 60 * 60 * 1000).toISOString();
  const knownIdentifiers = new Set(
    discountIdentifiers
      .map((identifier) => String(identifier).trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  let recordedOrders = [];

  if (shop) {
    try {
      recordedOrders = await getRecordedOrderAnalytics(shop, new Date(since));
    } catch (error) {
      console.error("[analytics] Unable to load recorded order analytics", error);
    }
  }
  const allNodes = [];
  let cursor = null;
  let hasNextPage = true;
  let pageCount = 0;

  // Fetch newest orders first, then filter locally. Shopify order search date
  // syntax varies by API/version and could return an empty dashboard even when
  // qualifying orders existed.
  while (hasNextPage && pageCount < MAX_ORDER_PAGES) {
    let response;
    let result;

    try {
      response = await admin.graphql(
        `#graphql
        query DiscountAnalytics($after: String) {
          orders(first: ${ORDER_PAGE_SIZE}, after: $after, query: "status:any", reverse: true, sortKey: CREATED_AT) {
            edges {
              cursor
              node {
                id
                createdAt
                currentTotalPriceSet { shopMoney { amount currencyCode } }
                totalDiscountsSet { shopMoney { amount currencyCode } }
                discountApplications(first: 30) {
                  edges {
                    node {
                      __typename
                      ... on AutomaticDiscountApplication { title }
                      ... on DiscountCodeApplication { code }
                    }
                  }
                }
              }
            }
            pageInfo { hasNextPage }
          }
        }`,
        { variables: { after: cursor } },
      );
      result = await response.json();
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("[analytics] Unable to fetch order analytics", error);

      return {
        orders: markAppDiscountOrders(recordedOrders, knownIdentifiers),
        graphqlErrors: [
          {
            message:
              "Order analytics could not be loaded right now. Make sure the app has the read_orders scope, then reopen it from Shopify Admin.",
          },
        ],
      };
    }

    if (result.errors?.length) {
      return {
        orders: markAppDiscountOrders(recordedOrders, knownIdentifiers),
        graphqlErrors: result.errors,
      };
    }

    const edges = result.data?.orders?.edges || [];
    pageCount += 1;
    allNodes.push(...edges.map(({ node }) => node));
    const oldestOrder = edges[edges.length - 1]?.node;
    hasNextPage = Boolean(result.data?.orders?.pageInfo?.hasNextPage) &&
      Boolean(oldestOrder?.createdAt && oldestOrder.createdAt >= since);
    cursor = edges[edges.length - 1]?.cursor || null;
  }

  const orders = mergeOrders(
    markAppDiscountOrders(
      allNodes.filter((node) => node.createdAt >= since).map((node) => ({
        id: node.id,
        createdAt: node.createdAt,
        revenue: Number(node.currentTotalPriceSet?.shopMoney?.amount || 0),
        savings: Number(node.totalDiscountsSet?.shopMoney?.amount || 0),
        currencyCode: node.currentTotalPriceSet?.shopMoney?.currencyCode || "USD",
        applications: (node.discountApplications?.edges || []).map(({ node: application }) =>
          application.title || application.code || "Discount",
        ),
      })),
      knownIdentifiers,
    ),
    markAppDiscountOrders(recordedOrders, knownIdentifiers),
  );

  return {
    orders,
    graphqlErrors: hasNextPage
      ? [{ message: "Dashboard analytics are showing a recent sample of orders so the page can load quickly." }]
      : [],
  };
}
import { getRecordedOrderAnalytics } from "./order-analytics.server";


function markAppDiscountOrders(orders, knownIdentifiers) {
  return orders.map((order) => {
    const applications = Array.isArray(order.applications) ? order.applications : [];

    return {
      ...order,
      hasDiscount: Number(order.savings || 0) > 0 || applications.length > 0,
      usesAppDiscount: applications.some((identifier) =>
        knownIdentifiers.has(String(identifier).trim().toLocaleLowerCase()),
      ),
    };
  });
}

function mergeOrders(primary, secondary) {
  const ordersById = new Map();

  // Prefer the fresh Admin API record, while retaining webhook records that
  // are outside the limited recent-order query.
  secondary.forEach((order) => ordersById.set(order.id, order));
  primary.forEach((order) => ordersById.set(order.id, order));

  return [...ordersById.values()].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}
