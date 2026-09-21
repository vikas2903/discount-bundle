import { createWebhookAction, webhookHealth } from "../utils/webhooks.server.js";

export const loader = webhookHealth;

export const action = createWebhookAction(["customers/redact"]);
