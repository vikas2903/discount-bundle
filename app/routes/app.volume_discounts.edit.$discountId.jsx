import { useEffect, useMemo, useState } from "react";
import { useFetcher, useNavigate, useParams, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import VolumeDiscountForm from "../components/volume-discounts/VolumeDiscountForm";
import { DEFAULT_VOLUME_CONFIG } from "../utils/volume-discount";

export default function EditVolumeDiscountPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { discountId } = useParams();
  const parentData = useRouteLoaderData("routes/app.volume_discounts");
  const { collections = [], products = [], discounts = [], loadError } = parentData || {};
  const discount = useMemo(
    () => discounts.find((item) => item.discountId === discountId) || null,
    [discountId, discounts],
  );
  const [form, setForm] = useState(() => createForm(discount));
  const errors = [
    ...(fetcher.data?.userErrors || []).map(({ message }) => message),
    ...(fetcher.data?.graphqlErrors || []).map(({ message }) => message),
  ]
    .filter(Boolean)
    .join(" | ");

  useEffect(() => {
    if (discount) setForm(createForm(discount));
  }, [discount]);

  useEffect(() => {
    if (!fetcher.data?.ok) return;

    shopify.toast.show("Quantity offer updated");
    navigate("/app/volume_discounts");
  }, [fetcher.data, navigate, shopify]);

  if (!discount) {
    return (
      <s-page>
        <s-banner tone="critical">
          <s-paragraph>That quantity offer could not be found.</s-paragraph>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page>
      <div style={{ ...fullWidthStyle, display: "grid", gap: "1rem" }}>
        <div style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.65rem" }}>Edit quantity offer</h1>
            <p style={{ margin: "0.35rem 0 0", color: "#64748b" }}>{discount.title}</p>
          </div>
          <button type="button" onClick={() => navigate("/app/volume_discounts")} style={backButtonStyle}>
            Back to quantity offers
          </button>
        </div>
        {loadError ? <s-banner tone="critical"><s-paragraph>{loadError}</s-paragraph></s-banner> : null}
        {errors ? <s-banner tone="critical"><s-paragraph>{errors}</s-paragraph></s-banner> : null}
        <s-section heading="Quantity offer setup">
          <VolumeDiscountForm
            fetcher={fetcher}
            form={form}
            setForm={setForm}
            collections={collections}
            products={products}
            isEditing
            editingDiscountId={discount.discountId}
            editingSchedule={{ startsAt: discount.startsAt || "", endsAt: discount.endsAt || "" }}
            onCancelEdit={() => navigate("/app/volume_discounts")}
            actionPath="/app/volume_discounts"
          />
        </s-section>
      </div>
    </s-page>
  );
}

function createForm(discount) {
  const config = discount?.config || {};

  return {
    title: config.title || discount?.title || "",
    message: config.message || DEFAULT_VOLUME_CONFIG.message,
    status: config.status || "DRAFT",
    productMode: config.productMode || "all",
    selectedCollectionIds: [...(config.selectedCollectionIds || [])],
    selectedProductIds: [...(config.selectedProductIds || [])],
    application: { ...DEFAULT_VOLUME_CONFIG.application, ...(config.application || {}) },
    combinations: { ...DEFAULT_VOLUME_CONFIG.combinations, ...(config.combinations || {}) },
    newCustomersOnly: Boolean(config.newCustomersOnly),
    storefrontMessages: {
      ...DEFAULT_VOLUME_CONFIG.storefrontMessages,
      ...(config.storefrontMessages || {}),
    },
    tiers:
      config.tiers?.length > 0
        ? config.tiers.map((tier) => ({ ...tier }))
        : DEFAULT_VOLUME_CONFIG.tiers.map((tier) => ({ ...tier })),
  };
}

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "1.1rem 1.25rem",
  border: "1px solid #dbe4f0",
  borderRadius: "0.9rem",
  background: "#f8fafc",
};

const fullWidthStyle = {
  width: "calc(100vw - 2rem)",
  maxWidth: "none",
  marginLeft: "calc(50% - 50vw + 1rem)",
  marginRight: "calc(50% - 50vw + 1rem)",
  boxSizing: "border-box",
};

const backButtonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "0.6rem",
  background: "#ffffff",
  padding: "0.65rem 0.85rem",
  cursor: "pointer",
  fontWeight: 600,
};
