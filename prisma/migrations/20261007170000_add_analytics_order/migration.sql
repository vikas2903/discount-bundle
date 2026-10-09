-- Stores non-personal, order-level attribution received from Shopify webhooks.
CREATE TABLE "AnalyticsOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "revenue" REAL NOT NULL DEFAULT 0,
    "savings" REAL NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "discountApplications" TEXT NOT NULL DEFAULT '[]',
    "sourceName" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AnalyticsOrder_shop_shopifyOrderId_key" ON "AnalyticsOrder"("shop", "shopifyOrderId");
CREATE INDEX "AnalyticsOrder_shop_createdAt_idx" ON "AnalyticsOrder"("shop", "createdAt");
