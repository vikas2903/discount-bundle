import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requireProSubscription } from "../utils/billing.server";

const FUNCTION_HANDLE = "bundle-pack-3-for-999";
const FLAT_PERCENTAGE_METAFIELD_NAMESPACE = "$app:bundle-pack-3-for-999";
const FLAT_PERCENTAGE_METAFIELD_KEY = "function-configuration";

export const loader = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  await requireProSubscription(billing, session);

  try {
    const response = await admin.graphql(
      `#graphql
        query ExistingFlatPercentageDiscounts {
          automaticDiscountNodes(first: 50) {
            edges {
              node {
                id
                metafield(
                  namespace: "${FLAT_PERCENTAGE_METAFIELD_NAMESPACE}"
                  key: "${FLAT_PERCENTAGE_METAFIELD_KEY}"
                ) {
                  value
                }
                automaticDiscount {
                  ... on DiscountAutomaticApp {
                    discountId
                    title
                    status
                    startsAt
                    endsAt
                  }
                }
              }
            }
          }
        }`,
    );

    const responseJson = await response.json();
    const discounts =
      responseJson.data?.automaticDiscountNodes?.edges
        ?.map(({ node }) => {
          const configValue = node.metafield?.value;
          const automaticDiscount = node.automaticDiscount;

          if (!configValue || !automaticDiscount?.discountId) {
            return null;
          }

          const config = parseFlatPercentageConfig(configValue);

          if (!isFlatPercentageConfig(config)) {
            return null;
          }

          return {
            nodeId: node.id,
            discountId: automaticDiscount.discountId,
            title: automaticDiscount.title,
            status: automaticDiscount.status,
            startsAt: automaticDiscount.startsAt,
            endsAt: automaticDiscount.endsAt,
            config,
          };
        })
        .filter(Boolean) || [];

    return {
      discounts,
      discountsError:
        responseJson.errors?.map(({ message }) => message).join(" | ") || null,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      discounts: [],
      discountsError: toErrorMessage(error),
    };
  }
};

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  await requireProSubscription(billing, session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");

  if (intent === "toggle-status") {
    const discountNodeId = String(formData.get("discountNodeId") || "").trim();
    const nextStatus = String(formData.get("nextStatus") || "").trim();

    if (!discountNodeId || !["enable", "disable"].includes(nextStatus)) {
      return {
        ok: false,
        action: intent,
        userErrors: [
          {
            field: ["discountNodeId"],
            message: "The selected flat percentage discount could not be updated.",
          },
        ],
        graphqlErrors: [],
      };
    }

    try {
      const response = await admin.graphql(
        `#graphql
          mutation ToggleFlatPercentageDiscount($id: ID!) {
            ${
              nextStatus === "disable"
                ? "discountAutomaticDeactivate"
                : "discountAutomaticActivate"
            }(id: $id) {
              automaticDiscountNode {
                automaticDiscount {
                  ... on DiscountAutomaticApp {
                    discountId
                    title
                    status
                    startsAt
                    endsAt
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
        {
          variables: {
            id: discountNodeId,
          },
        },
      );

      const responseJson = await response.json();
      const payload =
        nextStatus === "disable"
          ? responseJson.data?.discountAutomaticDeactivate
          : responseJson.data?.discountAutomaticActivate;

      return {
        ok:
          (payload?.userErrors || []).length === 0 &&
          Boolean(payload?.automaticDiscountNode?.automaticDiscount),
        action: intent,
        discount: payload?.automaticDiscountNode?.automaticDiscount ?? null,
        userErrors: payload?.userErrors || [],
        graphqlErrors: responseJson.errors || [],
        nextStatus,
      };
    } catch (error) {
      if (error instanceof Response) throw error;
      return {
        ok: false,
        action: intent,
        userErrors: [],
        graphqlErrors: [{ message: toErrorMessage(error) }],
      };
    }
  }

  const percentage = toPositiveNumber(formData.get("percentage"), 10);
  const message =
    String(formData.get("message") || "").trim() ||
    "Your percentage saving has been applied";
  const title =
    String(formData.get("title") || "").trim() ||
    `${percentage}% off`;

  const config = {
    discountType: "flat_percentage",
    percentage,
    message,
  };

  const automaticAppDiscount = {
    title,
    functionHandle: FUNCTION_HANDLE,
    startsAt: new Date().toISOString(),
    discountClasses: ["PRODUCT"],
    combinesWith: {
      productDiscounts: true,
      orderDiscounts: true,
      shippingDiscounts: true,
    },
    metafields: [
      {
        namespace: FLAT_PERCENTAGE_METAFIELD_NAMESPACE,
        key: FLAT_PERCENTAGE_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(config),
      },
    ],
  };

  try {
    const response = await admin.graphql(
      `#graphql
        mutation CreateFlatPercentageDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
            automaticAppDiscount {
              discountId
              title
              status
              startsAt
              endsAt
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: { automaticAppDiscount },
      },
    );

    const responseJson = await response.json();
    const payload = responseJson.data?.discountAutomaticAppCreate;

    return {
      ok:
        Boolean(payload?.automaticAppDiscount) &&
        (payload?.userErrors || []).length === 0,
      action: intent,
      discount: payload?.automaticAppDiscount ?? null,
      userErrors: payload?.userErrors || [],
      graphqlErrors: responseJson.errors || [],
      config,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false,
      action: intent,
      discount: null,
      userErrors: [],
      graphqlErrors: [{ message: toErrorMessage(error) }],
      config,
    };
  }
};

export default function FlatPercentageDiscountPage() {
  const createFetcher = useFetcher();
  const toggleFetcher = useFetcher();
  const shopify = useAppBridge();
  const { discounts, discountsError } = useLoaderData();

  useEffect(() => {
    if (createFetcher.data?.ok) {
      shopify.toast.show("Simple sale created");
    }
  }, [createFetcher.data?.ok, shopify]);

  useEffect(() => {
    if (toggleFetcher.data?.ok) {
      shopify.toast.show(
        toggleFetcher.data?.nextStatus === "disable"
          ? "Simple sale turned off"
          : "Simple sale turned on",
      );
    }
  }, [shopify, toggleFetcher.data]);

  return (
    <s-page heading="Simple sales">
      <s-section heading="Create a simple sale">
        <s-stack direction="block" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="tight">
              <s-heading>How this sale works</s-heading>
              <s-paragraph>
                This sale gives the same saving on every product in the shopping
                cart.
              </s-paragraph>
              <s-paragraph>
                Use it for simple store-wide sales, such as 10% off, 15% off,
                or 20% off.
              </s-paragraph>
            </s-stack>
          </s-box>

          <createFetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <input type="hidden" name="intent" value="create" />

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Offer details</s-heading>
                  <s-text-field
                    label="Offer name"
                    name="title"
                    defaultValue="10% off"
                  />
                  <s-text-field
                    label="Percentage to take off"
                    name="percentage"
                    type="number"
                    defaultValue="10"
                  />
                  <s-text-field
                    label="Cart message"
                    name="message"
                    defaultValue="Your percentage saving has been applied"
                  />
                </s-stack>
              </s-box>

              <s-button
                type="submit"
                variant="primary"
                loading={createFetcher.state !== "idle"}
              >
                Create sale
              </s-button>
            </s-stack>
          </createFetcher.Form>
        </s-stack>
      </s-section>

      <s-section heading="Your simple sales">
        {discountsError ? (
          <s-paragraph>
            Your saved simple sales could not be loaded: {discountsError}
          </s-paragraph>
        ) : discounts.length > 0 ? (
          <s-stack direction="block" gap="base">
            {discounts.map((discount) => {
              const isActive = discount.status === "ACTIVE";
              const togglingDiscountNodeId =
                toggleFetcher.formData?.get("discountNodeId");
              const isToggling =
                toggleFetcher.state !== "idle" &&
                togglingDiscountNodeId === discount.nodeId;

              return (
                <s-box
                  key={discount.nodeId}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="tight">
                    <s-heading>{discount.title}</s-heading>
                    <s-paragraph>Status: {isActive ? "On" : "Off"}</s-paragraph>
                    <s-paragraph>
                      Applies to: All products
                    </s-paragraph>
                    <s-paragraph>
                      Saving: {discount.config.percentage}% off
                    </s-paragraph>
                    <s-paragraph>Cart message: {discount.config.message}</s-paragraph>
                    <s-paragraph>Starts: {discount.startsAt}</s-paragraph>
                    <s-paragraph>
                      Ends: {discount.endsAt || "No end date"}
                    </s-paragraph>

                    <toggleFetcher.Form method="post">
                      <input type="hidden" name="intent" value="toggle-status" />
                      <input
                        type="hidden"
                        name="discountNodeId"
                        value={discount.nodeId}
                      />
                      <input
                        type="hidden"
                        name="nextStatus"
                        value={isActive ? "disable" : "enable"}
                      />
                      <s-button
                        type="submit"
                        variant="secondary"
                        loading={isToggling}
                      >
                        {isActive ? "Turn off" : "Turn on"}
                      </s-button>
                    </toggleFetcher.Form>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        ) : (
          <s-paragraph>
            You have not created a simple sale yet. Create one above and
            it will appear here.
          </s-paragraph>
        )}
      </s-section>

    </s-page>
  );
}

function parseFlatPercentageConfig(value) {
  const fallback = {
    discountType: "flat_percentage",
    percentage: 10,
    message: "Your percentage saving has been applied",
  };

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);

    return {
      discountType:
        parsed.discountType === "flat_percentage"
          ? parsed.discountType
          : fallback.discountType,
      percentage: toPositiveNumber(parsed.percentage, fallback.percentage),
      message:
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : fallback.message,
    };
  } catch {
    return fallback;
  }
}

function isFlatPercentageConfig(config) {
  return config.discountType === "flat_percentage";
}

function toPositiveNumber(value, fallback) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
