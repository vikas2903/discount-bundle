import { authenticate } from "../shopify.server";
import {
  BILLING_SUCCESS_PATH,
  checkSubscription,
  getBillingPathWithShop,
} from "../utils/billing.server";

// Shopify sends merchants here after hosted billing approval. Keep this route
// neutral: rebuild the embedded admin session first, then check the charge.
export const loader = async ({ request }) => {
  const { billing, redirect, session } = await authenticate.admin(request);
  let subscription = null;

  try {
    subscription = await checkSubscription(billing);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Unable to verify subscription after approval", error);
  }

  if (subscription) {
    return redirect(BILLING_SUCCESS_PATH);
  }

  const message =
    "Subscription approval was not completed or could not be verified yet. Please try again.";

  return redirect(getBillingPathWithShop(request, session, message));
};
