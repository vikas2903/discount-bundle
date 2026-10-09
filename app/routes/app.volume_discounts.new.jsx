import { useEffect, useState } from "react";
import { useFetcher, useNavigate, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import VolumeDiscountForm from "../components/volume-discounts/VolumeDiscountForm";
import { authenticate } from "../shopify.server";
import { checkSubscription } from "../utils/billing.server";
import {
  DEFAULT_VOLUME_CONFIG,
  normalizeVolumeConfig,
  parseVolumeConfig,
  validateVolumeConfig,
} from "../utils/volume-discount";
import {
  createVolumeDiscount,
  listVolumeDiscounts,
  resolveVolumeFunctionHandle,
} from "../services/volume-discount.server";

export const action = async ({ request }) => {
  const { admin, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const config = normalizeVolumeConfig(
    parseVolumeConfig(String(formData.get("config") || "{}")),
  );
  const validationErrors = validateVolumeConfig(config);
  const { discounts: existingDiscounts } = await listVolumeDiscounts(admin);
  const subscription = await checkSubscription(billing);

  if (!subscription && existingDiscounts.some((discount) => discount.status === "ACTIVE")) {
    return createActionError(
      "The Free plan includes one active quantity offer. Upgrade to Pro for unlimited offers.",
      config,
    );
  }

  const overlaps = existingDiscounts.filter(
    (discount) =>
      discount.status === "ACTIVE" &&
      discount.config.mode !== "legacy-product" &&
      volumeTargetsOverlap(config, discount.config),
  );

  if (validationErrors.length > 0 || overlaps.length > 0) {
    return {
      ok: false,
      config,
      userErrors: [
        ...validationErrors.map((message) => ({ field: ["config"], message })),
        ...overlaps.map((discount) => ({
          field: ["config"],
          message: `This discount overlaps with active volume discount "${discount.title}". Deactivate or change targeting before saving.`,
        })),
      ],
      graphqlErrors: [],
    };
  }

  try {
    return {
      ...(await createVolumeDiscount(admin, {
        title: config.title,
        startsAt: String(formData.get("startsAt") || "").trim() || new Date().toISOString(),
        endsAt: String(formData.get("endsAt") || "").trim() || null,
        functionHandle: resolveVolumeFunctionHandle(),
        config,
      })),
      config,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return createActionError(toErrorMessage(error), config);
  }
};

export default function NewVolumeDiscountPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const parentData = useRouteLoaderData("routes/app.volume_discounts");
  const { collections = [], products = [], loadError } = parentData || {};
  const [form, setForm] = useState(createInitialForm);
  const errors = [
    ...(fetcher.data?.userErrors || []).map(({ message }) => message),
    ...(fetcher.data?.graphqlErrors || []).map(({ message }) => message),
  ]
    .filter(Boolean)
    .join(" | ");

  useEffect(() => {
    if (fetcher.data?.config && !fetcher.data.ok) {
      setForm(fetcher.data.config);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!fetcher.data?.ok) return;

    shopify.toast.show("Quantity offer created");
    navigate("/app/volume_discounts");
  }, [fetcher.data, navigate, shopify]);

  return (
    <s-page>
      <div style={{ ...fullWidthStyle, display: "grid", gap: "1rem" }}>
        <div style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.65rem" }}>Create quantity offer</h1>
            <p style={{ margin: "0.35rem 0 0", color: "#64748b" }}>
              Set volume tiers, targeting, limits, combinations, and customer eligibility.
            </p>
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
            isEditing={false}
            editingDiscountId=""
            editingSchedule={{ startsAt: "", endsAt: "" }}
            onCancelEdit={() => navigate("/app/volume_discounts")}
          />
        </s-section>
      </div>
    </s-page>
  );
}

function createInitialForm() {
  return {
    ...DEFAULT_VOLUME_CONFIG,
    selectedCollectionIds: [],
    selectedProductIds: [],
    tiers: DEFAULT_VOLUME_CONFIG.tiers.map((tier) => ({ ...tier })),
    application: { ...DEFAULT_VOLUME_CONFIG.application },
    combinations: { ...DEFAULT_VOLUME_CONFIG.combinations },
    storefrontMessages: { ...DEFAULT_VOLUME_CONFIG.storefrontMessages },
  };
}

function volumeTargetsOverlap(left, right) {
  const leftMode = targetMode(left);
  const rightMode = targetMode(right);
  if (leftMode === "all" || rightMode === "all" || leftMode !== rightMode) return true;

  const key = leftMode === "products" ? "selectedProductIds" : "selectedCollectionIds";
  return (left[key] || []).some((id) => (right[key] || []).includes(id));
}

function targetMode(config) {
  if (config?.productMode === "collections" || config?.productMode === "products") {
    return config.productMode;
  }

  return config?.selectedCollectionIds?.length ? "collections" : "all";
}

function createActionError(message, config) {
  return {
    ok: false,
    config,
    userErrors: [{ field: ["config"], message }],
    graphqlErrors: [],
  };
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
