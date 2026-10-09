import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useOutlet } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { checkSubscription } from "../utils/billing.server";
import VolumeDiscountForm from "../components/volume-discounts/VolumeDiscountForm";
import {
  createVolumeDiscount,
  deleteVolumeDiscount,
  getVolumeCollections,
  getVolumeProducts,
  listVolumeDiscounts,
  resolveVolumeFunctionHandle,
  toggleVolumeDiscountStatus,
  updateVolumeDiscount,
} from "../services/volume-discount.server";
import {
  DEFAULT_VOLUME_CONFIG,
  normalizeVolumeConfig,
  parseVolumeConfig,
  validateVolumeConfig,
} from "../utils/volume-discount";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const [collectionsResult, productsResult, discountsResult] = await Promise.allSettled([
    getVolumeCollections(admin),
    getVolumeProducts(admin),
    listVolumeDiscounts(admin),
  ]);

  return {
    collections:
      collectionsResult.status === "fulfilled"
        ? collectionsResult.value.collections
        : [],
    products:
      productsResult.status === "fulfilled" ? productsResult.value.products : [],
    discounts:
      discountsResult.status === "fulfilled" ? discountsResult.value.discounts : [],
    loadError: [
      ...(collectionsResult.status === "rejected"
        ? [toErrorMessage(collectionsResult.reason)]
        : collectionsResult.value.graphqlErrors.map(({ message }) => message)),
      ...(productsResult.status === "rejected"
        ? [toErrorMessage(productsResult.reason)]
        : productsResult.value.graphqlErrors.map(({ message }) => message)),
      ...(discountsResult.status === "rejected"
        ? [toErrorMessage(discountsResult.reason)]
        : discountsResult.value.graphqlErrors.map(({ message }) => message)),
    ]
      .filter(Boolean)
      .join(" | "),
  };
};

export const action = async ({ request }) => {
  const { admin, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");

  if (intent === "toggle-status") {
    const discountId = String(formData.get("discountId") || "").trim();
    const nextStatus = String(formData.get("nextStatus") || "").trim();

    if (!discountId || !["enable", "disable"].includes(nextStatus)) {
      return createActionError(
        intent,
        "The selected volume discount could not be updated.",
      );
    }

    try {
      return {
        ...(await toggleVolumeDiscountStatus(admin, {
          id: discountId,
          nextStatus,
        })),
        action: intent,
      };
    } catch (error) {
      if (error instanceof Response) throw error;
      return createActionError(intent, toErrorMessage(error));
    }
  }

  if (intent === "delete") {
    const discountId = String(formData.get("discountId") || "").trim();

    if (!discountId) {
      return createActionError(
        intent,
        "The selected volume discount could not be deleted.",
      );
    }

    try {
      return {
        ...(await deleteVolumeDiscount(admin, discountId)),
        action: intent,
      };
    } catch (error) {
      if (error instanceof Response) throw error;
      return createActionError(intent, toErrorMessage(error));
    }
  }

  const config = normalizeVolumeConfig(
    parseVolumeConfig(String(formData.get("config") || "{}")),
  );
  const validationErrors = validateVolumeConfig(config);
  const { discounts: existingDiscounts } = await listVolumeDiscounts(admin);
  const subscription = await checkSubscription(billing);
  const editingDiscountId = String(formData.get("discountId") || "").trim();
  if (!subscription && intent === "create" && existingDiscounts.some((discount) => discount.status === "ACTIVE")) {
    return createActionError(intent, "The Free plan includes one active quantity offer. Upgrade to Pro for unlimited offers.", config);
  }
  const overlappingDiscounts = existingDiscounts.filter((discount) => {
    if (discount.status !== "ACTIVE") {
      return false;
    }

    if (discount.discountId === editingDiscountId) {
      return false;
    }

    if (discount.config.mode === "legacy-product") {
      return false;
    }

    return hasTargetOverlap(config, discount.config);
  });

  if (validationErrors.length > 0 || overlappingDiscounts.length > 0) {
    return {
      ok: false,
      action: intent,
      config,
      userErrors: [
        ...validationErrors.map((message) => ({
          field: ["config"],
          message,
        })),
        ...overlappingDiscounts.map((discount) => ({
          field: ["config"],
          message: `This discount overlaps with active volume discount "${discount.title}". Deactivate or change collections before saving.`,
        })),
      ],
      graphqlErrors: [],
    };
  }

  try {
    if (intent === "update") {
      const discountId = String(formData.get("discountId") || "").trim();

      if (!discountId) {
        return createActionError(intent, "Discount ID is required to update.");
      }

      return {
        ...(await updateVolumeDiscount(admin, {
          id: discountId,
          title: config.title,
          startsAt: String(formData.get("startsAt") || "").trim() || undefined,
          endsAt: String(formData.get("endsAt") || "").trim() || null,
          functionHandle: resolveVolumeFunctionHandle(),
          config,
        })),
        action: intent,
        config,
      };
    }

    return {
      ...(await createVolumeDiscount(admin, {
        title: config.title,
        startsAt: String(formData.get("startsAt") || "").trim() || new Date().toISOString(),
        endsAt: String(formData.get("endsAt") || "").trim() || null,
        functionHandle: resolveVolumeFunctionHandle(),
        config,
      })),
      action: intent,
      config,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return createActionError(intent, toErrorMessage(error), config);
  }
};

const INITIAL_FORM = {
  ...DEFAULT_VOLUME_CONFIG,
  tiers: [...DEFAULT_VOLUME_CONFIG.tiers],
};

export default function VolumeDiscountsPage() {
  const outlet = useOutlet();

  if (outlet) {
    return outlet;
  }

  return <VolumeDiscountListPage />;
}

function VolumeDiscountListPage() {
  const formFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { collections, products, discounts, loadError } = useLoaderData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [editingDiscountId, setEditingDiscountId] = useState("");
  const [editingSchedule, setEditingSchedule] = useState({
    startsAt: "",
    endsAt: "",
  });
  const now = Date.now();
  const activeDiscountCount = useMemo(
    () =>
      discounts.filter(
        (discount) => getDiscountDisplayState(discount, now).kind === "active",
      ).length,
    [discounts, now],
  );

  const collectionTitleMap = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection.title])),
    [collections],
  );
  const latestAction = formFetcher.data || actionFetcher.data;
  const editingDiscount = useMemo(
    () =>
      discounts.find((discount) => discount.discountId === editingDiscountId) || null,
    [discounts, editingDiscountId],
  );
  const overlapWarnings = useMemo(() => {
    return discounts
      .filter((discount) => discount.discountId !== editingDiscountId)
      .filter((discount) => discount.config.mode !== "legacy-product")
      .filter((discount) => discount.status === "ACTIVE")
      .filter((discount) => hasTargetOverlap(form, discount.config))
      .map((discount) => {
        const targets = getTargetSummary(discount.config, collectionTitleMap);

        return {
          discountId: discount.discountId,
          title: discount.title,
          targets,
        };
      });
  }, [collectionTitleMap, discounts, editingDiscountId, form]);
  const filteredDiscounts = useMemo(() => {
    if (activeTab === "active") {
      return discounts.filter(
        (discount) => getDiscountDisplayState(discount, now).kind === "active",
      );
    }

    if (activeTab === "draft") {
      return discounts.filter(
        (discount) => getDiscountDisplayState(discount, now).kind !== "active",
      );
    }

    return discounts;
  }, [activeTab, discounts, now]);

  useEffect(() => {
    if (formFetcher.data?.config) {
      setForm(formFetcher.data.config);
    }
  }, [formFetcher.data]);

  useEffect(() => {
    if (!formFetcher.data?.ok) {
      return;
    }

    if (formFetcher.data.action === "update") {
      shopify.toast.show("Quantity offer updated");
    } else {
      shopify.toast.show("Quantity offer created");
    }

    setForm(INITIAL_FORM);
    setShowForm(false);
    setEditingDiscountId("");
    setEditingSchedule({ startsAt: "", endsAt: "" });
  }, [formFetcher.data, shopify]);

  useEffect(() => {
    if (!actionFetcher.data?.ok) {
      return;
    }

    if (actionFetcher.data.action === "delete") {
      shopify.toast.show("Quantity offer deleted");
      if (editingDiscountId === String(actionFetcher.formData?.get("discountId") || "")) {
        setForm(INITIAL_FORM);
        setShowForm(false);
        setEditingDiscountId("");
        setEditingSchedule({ startsAt: "", endsAt: "" });
      }
      return;
    }

    if (actionFetcher.data.action === "toggle-status") {
      shopify.toast.show(
        actionFetcher.data.nextStatus === "disable"
          ? "Quantity offer turned off"
          : "Quantity offer turned on",
      );
    }
  }, [actionFetcher.data, actionFetcher.formData, editingDiscountId, shopify]);

  const actionErrorMessage = [
    ...(latestAction?.userErrors || []).map(({ message }) => message),
    ...(latestAction?.graphqlErrors || []).map(({ message }) => message),
  ]
    .filter(Boolean)
    .join(" | ");

  const startEditing = (discount) => {
    if (discount.config.mode === "legacy-product") {
      shopify.toast.show("Legacy product-rule discounts can be toggled or deleted only");
      return;
    }

    navigate(`edit/${encodeURIComponent(discount.discountId)}`);
  };

  const cancelEditing = () => {
    setShowForm(false);
    setEditingDiscountId("");
    setEditingSchedule({ startsAt: "", endsAt: "" });
    setForm(INITIAL_FORM);
  };

  return (
    <s-page>
      <div style={{ ...fullWidthStyle, display: "grid", gap: "1.5rem" }}>
        <div style={heroStyle}>
          <div style={{ display: "grid", gap: "0.5rem", maxWidth: "45rem" }}>
            <div style={eyebrowStyle}>Automatic discounts</div>
            <h1 style={{ margin: 0, fontSize: "clamp(1.6rem, 3vw, 2.1rem)", fontWeight: 750 }}>
              Quantity-based offers
            </h1>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>
              Reward shoppers for buying more with quantity tiers. Target all products,
              selected collections, or selected products—no discount code is needed.
            </p>
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
              <span style={metricPillStyle}>{discounts.length} total offers</span>
              <span style={{ ...metricPillStyle, color: "#177a34", background: "#dcfce7" }}>
                {activeDiscountCount} active
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("new")}
            style={{
              border: "1px solid #2b2b2b",
              background: "#333333",
              color: "#ffffff",
              borderRadius: "0.65rem",
              padding: "0.75rem 1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            Create quantity offer
          </button>
        </div>

        <div style={howItWorksStyle}>
          <div style={howItWorksIntroStyle}>
            <strong>How a quantity offer works</strong>
            <span>It applies automatically only when all of these rules are met.</span>
          </div>
          {[
            ["1", "The offer is active", "New offers start inactive. Use Activate when you are ready."],
            ["2", "The item is targeted", "It must be in your selected products or collections, unless you chose all products."],
            ["3", "The quantity qualifies", "The shopper must buy at least the quantity in one of your saving tiers."],
            ["4", "Other rules allow it", "Schedule, limits, new-customer setting, and discount combinations are checked."],
          ].map(([number, title, detail]) => (
            <div key={number} style={howItWorksStepStyle}>
              <span style={howItWorksNumberStyle}>{number}</span>
              <div><strong>{title}</strong><span>{detail}</span></div>
            </div>
          ))}
        </div>

        {loadError ? (
          <s-banner tone="critical">
            <s-paragraph>{loadError}</s-paragraph>
          </s-banner>
        ) : null}
        {actionErrorMessage ? (
          <s-banner tone="critical">
            <s-paragraph>{actionErrorMessage}</s-paragraph>
          </s-banner>
        ) : null}
        {showForm && overlapWarnings.length > 0 ? (
          <s-banner tone="warning">
            <s-paragraph>
              This offer includes products that are already covered by an active quantity offer.
              Review the offers below before saving so shoppers do not receive an unexpected saving.
            </s-paragraph>
            <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.6rem" }}>
              {overlapWarnings.map((warning) => (
                <s-paragraph key={warning.discountId}>
                  {warning.title} - {warning.targets}
                </s-paragraph>
              ))}
            </div>
          </s-banner>
        ) : null}

        <div style={panelStyle}>
          <div style={toolbarStyle}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[
                { key: "all", label: `All (${discounts.length})` },
                { key: "active", label: `Active (${activeDiscountCount})` },
                { key: "draft", label: `Inactive (${discounts.length - activeDiscountCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    ...tabButtonStyle,
                    background: activeTab === tab.key ? "#f1f1f1" : "transparent",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "920px",
              }}
            >
              <thead>
                <tr>
                  {["", "Name", "Discount", "Status", "Type", ""].map(
                    (heading, index) => (
                      <th key={`${heading}-${index}`} style={headerCellStyle}>
                        {heading === "" ? (index === 0 ? <input type="checkbox" disabled /> : null) : heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredDiscounts.length > 0 ? (
                  filteredDiscounts.map((discount) => {
                    const displayState = getDiscountDisplayState(discount, now);
                    const isActive = discount.status === "ACTIVE";
                    const targetedDiscountId = String(
                      actionFetcher.formData?.get("discountId") || "",
                    );
                    const currentAction = actionFetcher.data?.action;
                    const isWorkingOnThisDiscount =
                      actionFetcher.state !== "idle" &&
                      targetedDiscountId === discount.discountId;
                    const sortedTiers =
                      discount.config.mode === "legacy-product"
                        ? []
                        : [...discount.config.tiers].sort(
                            (left, right) => left.minQty - right.minQty,
                          );
                    const leadTier = sortedTiers[0];
                    const discountLabel = leadTier
                      ? `${leadTier.minQty} items -> ${leadTier.discountValue}${leadTier.discountType === "fixed" ? " off each" : "% off"}`
                      : "Legacy product rules";
                    const typeLabel = getTargetTypeLabel(discount.config);

                    return (
                      <tr key={discount.discountId}>
                        <td style={bodyCellStyle}>
                          <input type="checkbox" />
                        </td>
                        <td style={bodyCellStyle}>{discount.title}</td>
                        <td style={bodyCellStyle}>{discountLabel}</td>
                        <td style={bodyCellStyle}>
                          <span
                            style={{
                              ...statusPillStyle,
                              background: displayState.background,
                              color: displayState.color,
                            }}
                          >
                            {displayState.label}
                          </span>
                          <div style={{ marginTop: "0.35rem", color: "#64748b", fontSize: "0.78rem" }}>
                            {displayState.detail}
                          </div>
                        </td>
                        <td style={bodyCellStyle}>{typeLabel}</td>
                        <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: "0.45rem",
                            }}
                          >
                            {discount.config.mode !== "legacy-product" ? (
                              <button
                                type="button"
                                style={rowIconButtonStyle}
                                onClick={() => startEditing(discount)}
                              >
                                Edit
                              </button>
                            ) : null}
                            <actionFetcher.Form method="post">
                              <input type="hidden" name="intent" value="toggle-status" />
                              <input
                                type="hidden"
                                name="discountId"
                                value={discount.discountId}
                              />
                              <input
                                type="hidden"
                                name="nextStatus"
                                value={isActive ? "disable" : "enable"}
                              />
                              <button
                                type="submit"
                                style={rowIconButtonStyle}
                                disabled={
                                  isWorkingOnThisDiscount &&
                                  currentAction === "toggle-status"
                                }
                              >
                                {isActive ? "Deactivate" : "Activate"}
                              </button>
                            </actionFetcher.Form>
                            <actionFetcher.Form method="post">
                              <input type="hidden" name="intent" value="delete" />
                              <input
                                type="hidden"
                                name="discountId"
                                value={discount.discountId}
                              />
                              <button
                                type="submit"
                                style={rowIconButtonStyle}
                                disabled={
                                  isWorkingOnThisDiscount &&
                                  currentAction === "delete"
                                }
                              >
                                Delete
                              </button>
                            </actionFetcher.Form>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={emptyStateCellStyle}>
                      <div style={{ display: "grid", gap: "0.45rem", justifyItems: "center" }}>
                        <strong>No quantity offers found in this view.</strong>
                        <span>Create an offer to give shoppers a reason to add more items.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={pagerWrapStyle}>
            <button type="button" disabled style={pagerButtonStyle}>
              {"<"}
            </button>
            <span style={{ color: "#666", fontSize: "1.05rem" }}>
              Showing page 1 of 1
            </span>
            <button type="button" disabled style={pagerButtonStyle}>
              {">"}
            </button>
          </div>
        </div>

        {showForm ? (
          <s-section
            heading={editingDiscount ? "Edit quantity offer" : "Create quantity offer"}
          >
            <VolumeDiscountForm
              fetcher={formFetcher}
              form={form}
              setForm={setForm}
              collections={collections}
              products={products}
              isEditing={Boolean(editingDiscount)}
              editingDiscountId={editingDiscountId}
              editingSchedule={editingSchedule}
              onCancelEdit={cancelEditing}
            />
          </s-section>
        ) : null}
      </div>
    </s-page>
  );
}

function createActionError(action, message, config = null) {
  return {
    ok: false,
    action,
    config,
    userErrors: message
      ? [
          {
            field: ["config"],
            message,
          },
        ]
      : [],
    graphqlErrors: [],
  };
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function hasTargetOverlap(leftConfig, rightConfig) {
  const leftMode = getProductMode(leftConfig);
  const rightMode = getProductMode(rightConfig);

  if (leftMode === "all" || rightMode === "all") {
    return true;
  }

  if (leftMode !== rightMode) {
    // A selected product can belong to a selected collection. Without a full
    // product-to-collection lookup, treat the mixed scope as potentially overlapping.
    return true;
  }

  const key = leftMode === "products" ? "selectedProductIds" : "selectedCollectionIds";
  const left = Array.isArray(leftConfig?.[key]) ? leftConfig[key] : [];
  const right = Array.isArray(rightConfig?.[key]) ? rightConfig[key] : [];

  return left.some((id) => right.includes(id));
}

function getProductMode(config) {
  if (config?.productMode === "collections" || config?.productMode === "products") {
    return config.productMode;
  }

  return Array.isArray(config?.selectedCollectionIds) && config.selectedCollectionIds.length > 0
    ? "collections"
    : "all";
}

function getTargetTypeLabel(config) {
  const mode = getProductMode(config);

  if (mode === "collections") return "Selected collections";
  if (mode === "products") return "Selected products";
  return "All products";
}

function getTargetSummary(config, collectionTitleMap) {
  const mode = getProductMode(config);

  if (mode === "all") return "All products";
  if (mode === "products") {
    const count = config?.selectedProductIds?.length || 0;
    return `${count} selected product${count === 1 ? "" : "s"}`;
  }

  const collectionIds = config?.selectedCollectionIds || [];
  return collectionIds
    .map((collectionId) => collectionTitleMap.get(collectionId) || collectionId)
    .join(", ");
}

const panelStyle = {
  border: "1px solid #d7dbe0",
  borderRadius: "1rem",
  overflow: "hidden",
  background: "#ffffff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
};

const fullWidthStyle = {
  width: "calc(100vw - 2rem)",
  maxWidth: "none",
  marginLeft: "calc(50% - 50vw + 1rem)",
  marginRight: "calc(50% - 50vw + 1rem)",
  boxSizing: "border-box",
};

const heroStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "1.35rem",
  border: "1px solid #dbe4f0",
  borderRadius: "1rem",
  background: "linear-gradient(135deg, #f8fafc 0%, #eef6f1 100%)",
};

const howItWorksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
  gap: "0.75rem",
  padding: "1rem",
  border: "1px solid #dbe4f0",
  borderRadius: "1rem",
  background: "#ffffff",
};

const howItWorksIntroStyle = {
  display: "grid",
  alignContent: "center",
  gap: "0.35rem",
  color: "#334155",
  lineHeight: 1.45,
};

const howItWorksStepStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  padding: "0.75rem",
  borderRadius: "0.7rem",
  background: "#f8fafc",
  color: "#475569",
  fontSize: "0.88rem",
  lineHeight: 1.45,
};

const howItWorksNumberStyle = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: "1.55rem",
  height: "1.55rem",
  borderRadius: "50%",
  background: "#ccfbf1",
  color: "#0f766e",
  fontWeight: 800,
};

const eyebrowStyle = {
  color: "#0f766e",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const metricPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "0.35rem 0.65rem",
  background: "#e2e8f0",
  color: "#334155",
  fontSize: "0.8rem",
  fontWeight: 700,
};

const toolbarStyle = {
  padding: "0.7rem 0.8rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  borderBottom: "1px solid #e5e7eb",
  flexWrap: "wrap",
};

const tabButtonStyle = {
  border: "none",
  color: "#444",
  borderRadius: "0.7rem",
  padding: "0.6rem 0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

const headerCellStyle = {
  textAlign: "left",
  padding: "0.9rem 0.9rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  color: "#666",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const bodyCellStyle = {
  padding: "0.85rem 0.9rem",
  borderBottom: "1px solid #e5e7eb",
  color: "#2c2c2c",
  fontSize: "0.92rem",
};

const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "0.28rem 0.65rem",
  fontSize: "0.85rem",
};

const rowIconButtonStyle = {
  borderRadius: "0.6rem",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: "0.9rem",
  padding: "0.45rem 0.7rem",
  minHeight: "2rem",
};

const emptyStateCellStyle = {
  padding: "2rem 1rem",
  textAlign: "center",
  color: "#6b7280",
};

const pagerWrapStyle = {
  padding: "1.8rem 1rem",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "1rem",
};

const pagerButtonStyle = {
  width: "2rem",
  height: "2rem",
  borderRadius: "0.6rem",
  border: "1px solid #e5e7eb",
  background: "#efefef",
  color: "#6b7280",
  fontSize: "1.2rem",
  opacity: 0.45,
};

function getDiscountDisplayState(discount, now) {
  const startsAt = Date.parse(discount.startsAt || "");
  const endsAt = Date.parse(discount.endsAt || "");

  if (discount.status !== "ACTIVE") {
    return {
      kind: "inactive",
      label: "Inactive",
      detail: "Not currently running",
      background: "#eceff3",
      color: "#64748b",
    };
  }

  if (Number.isFinite(endsAt) && endsAt <= now) {
    return {
      kind: "expired",
      label: "Expired",
      detail: "Its scheduled end time has passed",
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  if (Number.isFinite(startsAt) && startsAt > now) {
    return {
      kind: "scheduled",
      label: "Scheduled",
      detail: `Starts ${new Date(startsAt).toLocaleString()}`,
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  return {
    kind: "active",
    label: "Active",
    detail: "Live for shoppers",
    background: "#b8f7c4",
    color: "#177a34",
  };
}
