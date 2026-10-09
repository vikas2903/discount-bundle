import { recordOrderAnalytics } from "../services/order-analytics.server";
import { createWebhookAction, webhookHealth } from "../utils/webhooks.server";

export const loader = webhookHealth;
export const action = createWebhookAction(["orders/updated"], {
  onPayload: recordOrderAnalytics,
});
