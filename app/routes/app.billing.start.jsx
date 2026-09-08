import { authenticate } from "../shopify.server";
import {
  DASHBOARD_HOME_PATH,
  checkSubscription,
  getBillingPathWithShop,
  requestSubscription,
} from "../utils/billing.server";

// This is a document navigation, initiated directly by the merchant's click.
// The Shopify billing helper creates the AppSubscription and throws Shopify's
// confirmation redirect. For embedded apps it first exits the iframe, then
// opens the hosted billing approval page in Shopify Admin.
export const loader = async ({ request }) => {
  const { billing, redirect, session } = await authenticate.admin(request);

  try {
    const subscription = await checkSubscription(billing);

    if (subscription) {
      return redirect(DASHBOARD_HOME_PATH);
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Unable to check subscription before billing request", error);
    const message = "Shopify could not refresh your billing session. Please reload the app from Shopify Admin and try again.";
    return redirect(getBillingPathWithShop(request, session, message));
  }

  try {
    await requestSubscription(billing, session);
  } catch (responseOrError) {
    if (responseOrError instanceof Response) {
      throw responseOrError;
    }

    console.error("[billing] Unable to create subscription", responseOrError);
    const message = getBillingErrorMessage(responseOrError);
    return redirect(getBillingPathWithShop(request, session, message));
  }
};

function getBillingErrorMessage(error) {
  const details = Array.isArray(error?.errorData)
    ? error.errorData
        .map((entry) => (typeof entry?.message === "string" ? entry.message : ""))
        .filter(Boolean)
    : [];

  return details.join(" ") || "Shopify could not create the subscription. Please try again.";
}
