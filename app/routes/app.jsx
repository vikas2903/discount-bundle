/* global process */
import { Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import {
  checkSubscription,
  getPlanDetails,
} from "../utils/billing.server";

const DASHBOARD_HOME_PATH = "/app/analytics";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  let subscription = null;

  try {
    subscription = await checkSubscription(billing);
  } catch (error) {
    if (error instanceof Response) throw error;
    // Navigation must still work if a newly installed store's billing lookup
    // briefly fails while its session is being created/refreshed.
    console.error("[billing] Unable to load the current subscription", error);
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan: getPlanDetails(subscription),
    shop: session?.shop || "",
  };
};

export default function App() {
  const { apiKey, plan, shop } = useLoaderData();
  const { search } = useLocation();
  const dashboardHref = buildEmbeddedHref(DASHBOARD_HOME_PATH, search, shop);
  const analyticsHref = buildEmbeddedHref("/app/analytics", search, shop);
  const volumeDiscountsHref = buildEmbeddedHref("/app/volume_discounts", search, shop);
  const bundleOffersHref = buildEmbeddedHref(
    plan.isPro ? "/app/disocunt_bundle" : "/app/billing",
    search,
    shop,
  );
  const storefrontSetupHref = buildEmbeddedHref("/app/storefront_setup", search, shop);
  const helpHref = buildEmbeddedHref("/app/help", search, shop);
  const billingHref = buildEmbeddedHref("/app/billing", search, shop);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={dashboardHref} rel="home">Dashboard</s-link>
        <s-link href={analyticsHref}>Analytics</s-link>
        <s-link href={volumeDiscountsHref}>Quantity offers</s-link>
        <s-link href={bundleOffersHref}> Bundle offers {plan.isPro ? "" : "(Pro)"}</s-link>
        <s-link href={storefrontSetupHref}>Website Template Setup</s-link>
        {/* <s-link href="/app/flatoff_disocunt">Simple sale {plan.isPro ? "" : "(Pro)"}</s-link> */}
        <s-link href={helpHref}>Help & support</s-link>
        <s-link href={billingHref}>Plans & billing</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

function buildEmbeddedHref(path, search, shop) {
  const searchParams = new URLSearchParams(search);

  if (shop && !searchParams.has("shop")) {
    searchParams.set("shop", shop);
  }

  const query = searchParams.toString();

  return query ? `${path}?${query}` : path;
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
