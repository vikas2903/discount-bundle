import { getAppUrl } from "./app-url.server.js";

export const MONTHLY_PLAN = "Discount Bundle Pro";

export const SUBSCRIPTION_PLAN = {
  name: MONTHLY_PLAN,
  trialDays: 14,
  amount: 10,
  currencyCode: "USD",
  intervalLabel: "month",
};

// Production billing is the safe default. Enable test charges explicitly for a development store.
export const BILLING_TEST_MODE = process.env.SHOPIFY_BILLING_TEST === "true";
export const BILLING_DISABLED = process.env.SHOPIFY_SKIP_BILLING === "true";
export const DASHBOARD_HOME_PATH = "/app/analytics";
export const BILLING_SUCCESS_PATH = "/app/disocunt_bundle";
export const BILLING_RETURN_PATH = "/app/billing/return";

function getBypassSubscription() {
  return {
    name: MONTHLY_PLAN,
    status: "ACTIVE",
  };
}

export async function checkSubscription(billing) {
  if (BILLING_DISABLED) {
    return getBypassSubscription();
  }

  const result = await billing.check({
    plans: [MONTHLY_PLAN],
    isTest: BILLING_TEST_MODE,
  });

  return result.appSubscriptions?.[0] ?? null;
}

function getBillingReturnUrl(session) {
  const appHandle = process.env.SHOPIFY_APP_HANDLE?.trim();
  const appUrl = getAppUrl();

  // Returning to Admin (rather than directly to the Railway URL) makes Shopify
  // launch the embedded app with its shop/host/session-token context.
  if (!session?.shop) {
    return undefined;
  }

  const storeHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const returnPath = `${BILLING_RETURN_PATH}?shop=${encodeURIComponent(session.shop)}`;

  if (appHandle) {
    // After Shopify approves the subscription, re-enter the embedded app through
    // Admin so Shopify restores shop/host/session-token context for the iframe.
    return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(appHandle)}${returnPath}`;
  }

  // Fallback for environments where SHOPIFY_APP_HANDLE is not configured yet.
  return appUrl ? `${appUrl}${returnPath}` : undefined;
}

export async function requestSubscription(billing, session) {
  if (BILLING_DISABLED) {
    return getBypassSubscription();
  }

  const returnUrl = getBillingReturnUrl(session);

  if (!returnUrl) {
    throw new Error(
      "Cannot start Shopify billing because the app could not build a return URL. Set SHOPIFY_APP_URL and make sure the request has a valid Shopify session.",
    );
  }

  return billing.request({
    plan: MONTHLY_PLAN,
    isTest: BILLING_TEST_MODE,
    returnUrl,
  });
}

export async function requireSubscription(billing, session) {
  if (BILLING_DISABLED) {
    return getBypassSubscription();
  }

  // Send unpaid merchants straight to Shopify's hosted billing approval page.
  const result = await billing.require({
    plans: [MONTHLY_PLAN],
    isTest: BILLING_TEST_MODE,
    onFailure: async () => requestSubscription(billing, session),
  });

  return result.appSubscriptions?.[0] ?? null;
}

// Free stores can create one quantity offer. All storefront bundles, flat
// sales, and additional quantity offers require an approved Pro subscription.
export async function requireProSubscription(billing, session) {
  return requireSubscription(billing, session);
}

export function getPlanDetails(subscription) {
  return {
    name: subscription ? "Pro" : "Free",
    isPro: Boolean(subscription),
    trialDays: SUBSCRIPTION_PLAN.trialDays,
  };
}

export function getBillingPathWithShop(request, session, message = "") {
  const requestUrl = new URL(request.url);
  const billingUrl = new URL("/app/billing", requestUrl.origin);

  for (const key of ["shop", "host", "embedded", "locale"]) {
    const value = requestUrl.searchParams.get(key);

    if (value) {
      billingUrl.searchParams.set(key, value);
    }
  }

  if (session?.shop && !billingUrl.searchParams.has("shop")) {
    billingUrl.searchParams.set("shop", session.shop);
  }

  if (message) {
    billingUrl.searchParams.set("billing_error", message);
  }

  return `${billingUrl.pathname}${billingUrl.search}`;
}
