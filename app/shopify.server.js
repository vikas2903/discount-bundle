import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  MONTHLY_PLAN,
  SUBSCRIPTION_PLAN,
} from "./utils/billing.server";

import { getAppUrl } from "./utils/app-url.server.js";

for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"]) {
  if (!process.env[key]?.trim()) {
    throw new Error(`[Shopify config] ${key} is required. Use the credentials for the same app as the deployed Shopify configuration.`);
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY.trim(),
  apiSecretKey: process.env.SHOPIFY_API_SECRET.trim(),
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean),
  appUrl: getAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      trialDays: SUBSCRIPTION_PLAN.trialDays,
      lineItems: [
        {
          amount: SUBSCRIPTION_PLAN.amount,
          currencyCode: SUBSCRIPTION_PLAN.currencyCode,
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
