import { buildEmbeddedHref } from "../utils/embedded-navigation.js";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import {
  BILLING_DISABLED,
  BILLING_TEST_MODE,
  SUBSCRIPTION_PLAN,
  checkSubscription,
} from "../utils/billing.server";

const FREE_FEATURES = [
  "One active quantity / volume discount",
  "Percentage-based quantity tiers",
  "Collection targeting",
  "One product-page quantity-offer template",
  "Offer scheduling, editing, and basic in-app support",
];

const PRO_FEATURES = [
  "Unlimited active quantity / volume discounts",
  "All discount types: quantity tiers, fixed-price bundles, percentage bundles, and simple percentage sales",
  "Bundle template 1: mix-and-match collection bundle page",
  "Bundle template 2: alternative collection bundle page",
  "Volume discount template: buy-more-save-more product-page offer",
  "Storefront setup and theme-editor installation links",
  "Collection targeting, offer scheduling, and editing",
  "GoKwik and Shiprocket checkout snippets",
  "Priority Pro in-app support",
];

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  let subscription = null;
  let billingError = "";

  try {
    subscription = await checkSubscription(billing);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Unable to load subscription on billing page", error);
    billingError =
      "We could not refresh your billing session. Reload the app from Shopify Admin if this message stays visible.";
  }

  return {
    plan: SUBSCRIPTION_PLAN,
    subscription,
    shop: session?.shop || "",
    billingError,
    billingDisabled: BILLING_DISABLED,
    billingTestMode: BILLING_TEST_MODE,
  };
};

// A Free plan does not need a Shopify subscription. Cancelling the active Pro
// subscription is therefore the self-service downgrade operation.
export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "downgrade-to-free") {
    return { ok: false, message: "Unsupported billing action." };
  }

  if (BILLING_DISABLED) {
    return {
      ok: false,
      message: "Billing is bypassed in this environment, so there is no subscription to cancel.",
    };
  }

  try {
    const subscription = await checkSubscription(billing);

    if (!subscription?.id) {
      return { ok: true, message: "Your store is already on the Free plan." };
    }

    await billing.cancel({
      subscriptionId: subscription.id,
      isTest: BILLING_TEST_MODE,
      // End Pro immediately and ask Shopify to create any applicable prorated credit.
      prorate: true,
    });

    return {
      ok: true,
      message: "Pro has been cancelled and your store is now on the Free plan. Shopify will show any prorated credit in your charge history.",
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Unable to downgrade subscription", error);
    return {
      ok: false,
      message: getBillingErrorMessage(error, "Shopify could not cancel the Pro subscription. Please try again."),
    };
  }
};

export default function BillingPage() {
  const { plan, subscription, shop, billingError: loaderBillingError, billingDisabled, billingTestMode } = useLoaderData();
  const { search } = useLocation();
  const downgradeFetcher = useFetcher();
  const billingError = new URLSearchParams(search).get("billing_error") || loaderBillingError || "";
  const hasSubscription = Boolean(subscription);
  const isDowngrading = downgradeFetcher.state !== "idle";
  const downgradeResult = downgradeFetcher.data;

  function startSubscription() {
    // Preserve Shopify's embedded host and shop query parameters. The target
    // route is loaded as a document, just like a conventional Subscribe link.
    window.location.assign(buildEmbeddedHref("/app/billing/start", window.location.search, shop));
  }

  function confirmDowngrade(event) {
    if (!window.confirm("Downgrade to Free? Pro features will stop immediately. Shopify will calculate a prorated credit for any unused paid time.")) {
      event.preventDefault();
    }
  }

  return (
    <s-page heading="Plans & billing">
      <div style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #111111 0%, #1d3b2f 55%, #6fcb8f 100%)",
            borderRadius: "1.2rem",
            padding: "1.1rem",
            color: "#ffffff",
            boxShadow: "0 18px 40px rgba(17, 24, 39, 0.18)",
          }}
        >
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <div style={heroBadgeStyle}>Billing overview</div>
            <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800 }}>
              Choose the plan that fits your store
            </h2>
            <p style={{ margin: 0, maxWidth: "48rem", color: "rgba(255,255,255,0.92)" }}>
              Start on Free, or approve Pro to begin a {plan.trialDays}-day free trial. Shopify automatically starts the ${plan.amount} monthly Pro subscription after the trial unless the merchant cancels it in Shopify Admin.
            </p>
          </div>
        </div>

        {hasSubscription ? (
          <s-banner tone="success">
            <s-paragraph>
              Your app subscription is active{subscription.status ? ` (${subscription.status})` : ""}.
            </s-paragraph>
          </s-banner>
        ) : null}

        {billingDisabled ? (
          <s-banner tone="info">
            <s-paragraph>
              Billing is currently bypassed in this environment, so plan approvals are not required.
            </s-paragraph>
          </s-banner>
        ) : null}

        {billingError ? (
          <s-banner tone="critical">
            <s-paragraph>{billingError}</s-paragraph>
          </s-banner>
        ) : null}

        {downgradeResult?.ok ? (
          <s-banner tone="success">
            <s-paragraph>{downgradeResult.message}</s-paragraph>
          </s-banner>
        ) : null}

        {downgradeResult && !downgradeResult.ok ? (
          <s-banner tone="critical">
            <s-paragraph>{downgradeResult.message}</s-paragraph>
          </s-banner>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <section style={buildPlanCardStyle("#f8fafc", "#d1d5db")}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <div style={planTagStyle("#334155", "#e2e8f0")}>Free</div>
              <div style={statusPillStyle(hasSubscription ? "#64748b" : "#0f766e")}>
                {hasSubscription ? "Available" : "Current plan"}
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>$0 / month</h3>
              <p style={mutedCopyStyle}>A simple plan for one buy-more-save-more offer. No card or trial approval is required.</p>
            </div>
            <ul style={featureListStyle}>{FREE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {!hasSubscription ? <div style={noteBoxStyle}>Your store is currently on Free.</div> : null}
            {hasSubscription && !billingDisabled ? (
              <downgradeFetcher.Form method="post" onSubmit={confirmDowngrade}>
                <input type="hidden" name="intent" value="downgrade-to-free" />
                <s-button type="submit" variant="secondary" loading={isDowngrading}>
                  Downgrade to Free
                </s-button>
              </downgradeFetcher.Form>
            ) : null}
          </section>

          <section style={buildPlanCardStyle("#ffffff", "#111111")}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div style={planTagStyle("#111111", "#f3f4f6")}>Pro plan</div>
              <div style={statusPillStyle(hasSubscription ? "#0f766e" : "#92400e")}>
                {hasSubscription ? "Active" : "14-day trial"}
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.35rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.55rem", fontWeight: 800 }}>
                ${plan.amount} / {plan.intervalLabel}
              </h3>
              <p style={mutedCopyStyle}>
                Unlock every discount type and all three storefront templates free for {plan.trialDays} days. Shopify then bills ${plan.amount} every {plan.intervalLabel}.
              </p>
            </div>

            <ul style={featureListStyle}>
              {PRO_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            {hasSubscription ? (
              <div style={noteBoxStyle}>
                Pro is active for this store. Use the Free-plan downgrade option to cancel it without leaving the app.
              </div>
            ) : (
              <s-button type="button" variant="primary" onClick={startSubscription}>
                Start {plan.trialDays}-day Pro trial
              </s-button>
            )}

            <div style={noteBoxStyle}>
              Downgrading to Free cancels Pro immediately. Shopify calculates any applicable prorated credit and records it in the app charge history.
            </div>

            {billingTestMode ? (
              <p style={footnoteStyle}>Billing requests are running in Shopify test mode.</p>
            ) : null}
          </section>
        </div>
      </div>
    </s-page>
  );
}

function buildPlanCardStyle(background, borderColor) {
  return {
    background,
    border: `1px solid ${borderColor}`,
    borderRadius: "1rem",
    padding: "1rem",
    display: "grid",
    gap: "0.9rem",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
  };
}

const heroBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.25rem 0.55rem",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.14)",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const planTagStyle = (color, background) => ({
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  alignSelf: "start",
  padding: "0.28rem 0.6rem",
  borderRadius: "999px",
  color,
  background,
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
});

const mutedCopyStyle = {
  margin: 0,
  color: "#4b5563",
  fontSize: "0.92rem",
};

const featureListStyle = {
  margin: 0,
  paddingLeft: "1.1rem",
  display: "grid",
  gap: "0.45rem",
  color: "#111827",
};

const noteBoxStyle = {
  padding: "0.8rem 0.9rem",
  borderRadius: "0.85rem",
  background: "#f3f4f6",
  color: "#1f2937",
  fontSize: "0.9rem",
};

const statusPillStyle = (color) => ({
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.3rem 0.7rem",
  borderRadius: "999px",
  background: `${color}16`,
  color,
  fontSize: "0.78rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
});

const footnoteStyle = {
  margin: 0,
  fontSize: "0.78rem",
  color: "#6b7280",
};

function getBillingErrorMessage(error, fallback) {
  const details = Array.isArray(error?.errorData)
    ? error.errorData
        .map((entry) => (typeof entry?.message === "string" ? entry.message : ""))
        .filter(Boolean)
    : [];

  return details.join(" ") || fallback;
}
