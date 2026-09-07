import { isRouteErrorResponse, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getDiscountAnalytics,
  getShopCurrencyCode,
} from "../services/analytics.server";
import { listBundleDiscounts } from "../services/bundle-discount.server";
import { listVolumeDiscounts } from "../services/volume-discount.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const [currencyCode, bundleResult, volumeResult] = await Promise.all([
      getShopCurrencyCode(admin),
      safelyLoadDashboardData(() => listBundleDiscounts(admin), "Bundle offers could not be loaded right now."),
      safelyLoadDashboardData(() => listVolumeDiscounts(admin), "Quantity offers could not be loaded right now."),
    ]);
    const identifiers = [...bundleResult.discounts, ...volumeResult.discounts]
      .flatMap((discount) => [discount.title, discount.config?.message])
      .filter(Boolean);
    const analytics = await getDiscountAnalytics(admin, identifiers);
    const offers = [
      ...bundleResult.discounts.map((discount) => toOffer(discount, "Bundle")),
      ...volumeResult.discounts.map((discount) => toOffer(discount, "Quantity")),
    ];
    const orders = analytics.orders.filter((order) => order.usesAppDiscount);

    return {
      shop: session.shop,
      currencyCode,
      orders,
      offers: summarizeOffers(offers, orders),
      loadError: [
        ...bundleResult.graphqlErrors,
        ...volumeResult.graphqlErrors,
        ...analytics.graphqlErrors,
      ].map(({ message }) => message).join(" | ") || null,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[analytics] Dashboard loader failed", error);

    return {
      shop: session.shop,
      currencyCode: "USD",
      orders: [],
      offers: [],
      loadError: "Dashboard data could not be loaded right now. Reopen the app from Shopify Admin and try again.",
    };
  }
};

export default function AnalyticsPage() {
  const loaderData = useLoaderData();
  const shop = loaderData?.shop || "your store";
  const currencyCode = loaderData?.currencyCode || "USD";
  const orders = Array.isArray(loaderData?.orders) ? loaderData.orders : [];
  const offers = Array.isArray(loaderData?.offers) ? loaderData.offers : [];
  const loadError = loaderData?.loadError || null;
  const money = getMoneyFormatter(currencyCode);
  const savings = orders.reduce((total, order) => total + order.savings, 0);
  const revenue = orders.reduce((total, order) => total + order.revenue, 0);
  const activeOffers = offers.filter((offer) => offer.status === "ACTIVE").length;
  const averageOrderValue = orders.length > 0 ? revenue / orders.length : 0;
  const averageSaving = orders.length > 0 ? savings / orders.length : 0;
  const bundleOrders = offers
    .filter((offer) => offer.type === "Bundle")
    .reduce((total, offer) => total + offer.orderCount, 0);
  const quantityOrders = offers
    .filter((offer) => offer.type === "Quantity")
    .reduce((total, offer) => total + offer.orderCount, 0);
  const bestOffer = [...offers].sort((left, right) => right.revenue - left.revenue)[0];

  return (
    <s-page heading="Analytics">
      <div style={{ display: "grid", gap: "1rem" }}>
        <p style={{ margin: 0, color: "#64748b" }}>
          Last 30 days for {shop}. These numbers include only offers created in this app.
        </p>
        {loadError ? <s-banner tone="warning"><s-paragraph>{loadError}</s-paragraph></s-banner> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.8rem" }}>
          <Metric label="Offers created" value={offers.length} detail={`${activeOffers} active offer${activeOffers === 1 ? "" : "s"}`} />
          <Metric label="Offer orders" value={orders.length} detail="Orders using your app offers" />
          <Metric label="Customer savings" value={money.format(savings)} detail="Savings from your app offers" />
          <Metric label="Sales after discounts" value={money.format(revenue)} detail="Amount paid after your app offer is applied" />
          <Metric label="Average order value" value={money.format(averageOrderValue)} detail="Average paid amount for orders using an app offer" />
          <Metric label="Average saving per order" value={money.format(averageSaving)} detail="Average discount given on orders using an app offer" />
          <Metric label="Bundle offer orders" value={bundleOrders} detail="Orders attributed to your bundle offers" />
          <Metric label="Quantity offer orders" value={quantityOrders} detail="Orders attributed to your quantity offers" />
        </div>
        <section style={{ padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.85rem", background: "#f8fafc" }}>
          <div style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>Best-performing offer</div>
          {bestOffer ? <><strong style={{ display: "block", marginTop: "0.35rem", color: "#0f172a", fontSize: "1.1rem" }}>{bestOffer.title}</strong><p style={{ margin: "0.3rem 0 0", color: "#475569", fontSize: "0.86rem" }}>{bestOffer.orderCount} orders · {money.format(bestOffer.revenue)} sales after discounts · {money.format(bestOffer.savings)} customer savings</p></> : <p style={{ margin: "0.35rem 0 0", color: "#475569", fontSize: "0.86rem" }}>Create and activate an offer to see its performance here.</p>}
        </section>
        <section style={{ overflowX: "auto", border: "1px solid #dbe4ea", borderRadius: "0.85rem", background: "#fff" }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <HeaderCell>Offer</HeaderCell>
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Orders</HeaderCell>
                <HeaderCell>Revenue</HeaderCell>
                <HeaderCell>Savings</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {offers.length > 0 ? offers.map((offer) => (
                <tr key={`${offer.type}-${offer.id}`}>
                  <BodyCell>{offer.title}</BodyCell>
                  <BodyCell>{offer.type}</BodyCell>
                  <BodyCell>{offer.status === "ACTIVE" ? "Active" : "Draft"}</BodyCell>
                  <BodyCell>{offer.orderCount}</BodyCell>
                  <BodyCell>{money.format(offer.revenue)}</BodyCell>
                  <BodyCell>{money.format(offer.savings)}</BodyCell>
                </tr>
              )) : (
                <tr><BodyCell colSpan={6}>No quantity or bundle offers have been created in this app yet.</BodyCell></tr>
              )}
            </tbody>
          </table>
        </section>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
            padding: "1.25rem",
            border: "1px solid #c7d2fe",
            borderRadius: "0.9rem",
            background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 70%)",
          }}
        >
          <div style={{ display: "grid", alignContent: "start", gap: "0.7rem" }}>
            <div style={{ color: "#4f46e5", fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Explore another app
            </div>
            <div>
              <h2 style={{ margin: 0, color: "#172554", fontSize: "1.35rem" }}>Upcart — Cart Drawer & Upsell</h2>
              <p style={{ margin: "0.45rem 0 0", color: "#475569", lineHeight: 1.55 }}>
                Turn your cart into a fast, responsive sales experience with tailored rewards, progress goals, and product recommendations for desktop and mobile.
              </p>
            </div>
            <div>
              <a
                href="https://apps.shopify.com/quickcart-1"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", minHeight: "2.5rem", padding: "0 1rem", borderRadius: "0.55rem", background: "#4f46e5", color: "#fff", fontWeight: 700, textDecoration: "none" }}
              >
                View Upcart on Shopify App Store
              </a>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "0.7rem" }}>
            <Feature title="Responsive cart drawer" detail="A smooth cart experience across desktop and mobile." />
            <Feature title="Smart cart goals" detail="Price and collection-based progress bars with automatic rewards." />
            <Feature title="Upsells & cross-sells" detail="Relevant recommendations designed to raise average order value." />
            <Feature title="Automatic free gifts" detail="Unlock gifts when customers reach configured cart-total goals." />
          </div>
        </section>
        {/* <s-banner tone="info"><s-paragraph>Analytics uses order totals and discount data only. It does not read customer information.</s-paragraph></s-banner> */}
      </div>
    </s-page>
  );
}

function Metric({ label, value, detail }) {
  return <section style={{ padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.85rem", background: "#fff" }}><div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 700 }}>{label}</div><strong style={{ display: "block", marginTop: "0.35rem", fontSize: "1.55rem" }}>{value}</strong><div style={{ marginTop: "0.35rem", color: "#64748b", fontSize: "0.8rem" }}>{detail}</div></section>;
}

function Feature({ title, detail }) {
  return <div style={{ padding: "0.8rem", border: "1px solid #dbe4ea", borderRadius: "0.7rem", background: "rgba(255,255,255,0.88)" }}><strong style={{ display: "block", color: "#1e1b4b", fontSize: "0.88rem" }}>{title}</strong><span style={{ display: "block", marginTop: "0.3rem", color: "#64748b", fontSize: "0.8rem", lineHeight: 1.45 }}>{detail}</span></div>;
}

function HeaderCell({ children }) {
  return <th style={tableHeaderStyle}>{children}</th>;
}

function BodyCell({ children, colSpan }) {
  return <td colSpan={colSpan} style={tableCellStyle}>{children}</td>;
}

function toOffer(discount, type) {
  return {
    id: discount.discountId,
    title: discount.title,
    type,
    status: discount.status,
    identifiers: [discount.title, discount.config?.message]
      .map(normalizeIdentifier)
      .filter(Boolean),
  };
}

function summarizeOffers(offers, orders) {
  return offers.map((offer) => {
    const matchingOrders = orders.filter((order) =>
      order.applications.some((application) =>
        offer.identifiers.includes(normalizeIdentifier(application)),
      ),
    );

    return {
      ...offer,
      orderCount: matchingOrders.length,
      revenue: matchingOrders.reduce((total, order) => total + order.revenue, 0),
      savings: matchingOrders.reduce((total, order) => total + order.savings, 0),
    };
  });
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function getMoneyFormatter(currencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currencyCode || "USD"),
    });
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    });
  }
}

async function safelyLoadDashboardData(loadData, fallbackMessage) {
  try {
    return await loadData();
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[analytics] Unable to load dashboard data", error);

    return {
      discounts: [],
      graphqlErrors: [{ message: fallbackMessage }],
    };
  }
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) return boundary.error(error);

  console.error("[analytics] Dashboard render failed", error);

  return (
    <s-page heading="Analytics">
      <div style={{ display: "grid", gap: "1rem" }}>
        <s-banner tone="critical">
          <s-paragraph>
            Dashboard could not render right now. Reopen the app from Shopify Admin and try again.
          </s-paragraph>
        </s-banner>
        <section style={{ padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.85rem", background: "#fff" }}>
          <strong>Analytics</strong>
          <p style={{ margin: "0.4rem 0 0", color: "#64748b" }}>
            The rest of the app can still be used from the navigation.
          </p>
        </section>
      </div>
    </s-page>
  );
}

const tableHeaderStyle = { padding: "0.85rem 1rem", textAlign: "left", color: "#475569", fontSize: "0.8rem", borderBottom: "1px solid #dbe4ea" };
const tableCellStyle = { padding: "0.9rem 1rem", borderBottom: "1px solid #eef2f7", color: "#1e293b" };
