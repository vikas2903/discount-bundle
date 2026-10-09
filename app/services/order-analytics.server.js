import prisma from "../db.server";

export async function recordOrderAnalytics({ shop, payload }) {
  const shopifyOrderId = String(payload?.admin_graphql_api_id || payload?.id || "").trim();

  if (!shopifyOrderId) {
    throw new Error("Order webhook did not include an order ID.");
  }

  const createdAt = parseDate(payload.created_at);
  const updatedAt = parseDate(payload.updated_at, createdAt);
  const discountApplications = getDiscountApplications(payload);

  await prisma.analyticsOrder.upsert({
    where: { shop_shopifyOrderId: { shop, shopifyOrderId } },
    create: {
      shop,
      shopifyOrderId,
      createdAt,
      updatedAt,
      revenue: toAmount(payload.current_total_price ?? payload.total_price),
      savings: toAmount(payload.total_discounts),
      currencyCode: String(payload.currency || "USD"),
      discountApplications: JSON.stringify(discountApplications),
      sourceName: optionalString(payload.source_name),
    },
    update: {
      updatedAt,
      revenue: toAmount(payload.current_total_price ?? payload.total_price),
      savings: toAmount(payload.total_discounts),
      currencyCode: String(payload.currency || "USD"),
      discountApplications: JSON.stringify(discountApplications),
      sourceName: optionalString(payload.source_name),
    },
  });
}

export async function getRecordedOrderAnalytics(shop, since) {
  try {
    const records = await prisma.analyticsOrder.findMany({
      where: { shop, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });

    return records.map((record) => ({
      id: record.shopifyOrderId,
      createdAt: record.createdAt.toISOString(),
      revenue: record.revenue,
      savings: record.savings,
      currencyCode: record.currencyCode,
      applications: parseApplications(record.discountApplications),
    }));
  } catch (error) {
    // Existing installations continue using the Admin API until the additive
    // migration has been applied during deployment.
    if (isMissingAnalyticsTable(error)) return [];
    throw error;
  }
}

function getDiscountApplications(payload) {
  const applications = Array.isArray(payload?.discount_applications)
    ? payload.discount_applications
    : [];
  const codes = Array.isArray(payload?.discount_codes) ? payload.discount_codes : [];

  return [...applications, ...codes]
    .map((application) =>
      optionalString(application?.title) ||
      optionalString(application?.code) ||
      optionalString(application?.description),
    )
    .filter(Boolean);
}

function parseApplications(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseDate(value, fallback = new Date()) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function optionalString(value) {
  const result = String(value || "").trim();
  return result || null;
}

function isMissingAnalyticsTable(error) {
  return error?.code === "P2021" || String(error?.message || "").includes("AnalyticsOrder");
}
