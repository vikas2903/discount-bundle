/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import { DEFAULT_BUNDLE_CONFIG } from "../../utils/bundle-discount";

const { RangePicker } = DatePicker;

export function BundleDiscountForm({
  action = "create",
  collections,
  defaultValues,
  submitLabel,
  loading = false,
  error,
}) {
  const shopify = useAppBridge();
  const initialValues = useMemo(
    () => ({
      title: defaultValues?.title || "Bundle Discount",
      startsAt:
        toDateTimeLocalValue(defaultValues?.startsAt) ||
        toDateTimeLocalValue(new Date().toISOString()),
      endsAt: toDateTimeLocalValue(defaultValues?.endsAt),
      config: {
        bundleTiers: (defaultValues?.config?.bundleTiers ?? DEFAULT_BUNDLE_CONFIG.bundleTiers).map(toFormTier),
        selectedCollectionIds:
          defaultValues?.config?.selectedCollectionIds ??
          DEFAULT_BUNDLE_CONFIG.selectedCollectionIds,
        message:
          defaultValues?.config?.message ?? DEFAULT_BUNDLE_CONFIG.message,
      },
    }),
    [defaultValues],
  );
  const [scheduleRange, setScheduleRange] = useState(() => [
    toDayjs(initialValues.startsAt) || dayjs(),
    toDayjs(initialValues.endsAt),
  ]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState(
    initialValues.config.selectedCollectionIds,
  );
  const [bundleTiers, setBundleTiers] = useState(initialValues.config.bundleTiers);
  const startsAtValue = scheduleRange[0]?.format("YYYY-MM-DDTHH:mm") || "";
  const endsAtValue = scheduleRange[1]?.format("YYYY-MM-DDTHH:mm") || "";
  const selectedCollectionTitles = useMemo(() => {
    const selectedIds = new Set(selectedCollectionIds);

    return collections
      .filter((collection) => selectedIds.has(collection.id))
      .map((collection) => collection.title);
  }, [collections, selectedCollectionIds]);
  const appliesToLabel =
    selectedCollectionTitles.length > 0
      ? selectedCollectionTitles.join(", ")
      : "All products";
  const sortedPreviewTiers = [...bundleTiers]
    .map((tier) => ({
      quantity: Number(tier.quantity) || 0,
      discountType: ["percentage", "free"].includes(tier.discountType) ? tier.discountType : "fixed_price",
      freeQuantity: Number(tier.freeQuantity) || 0,
      value: Number(tier.value ?? tier.price) || 0,
    }))
    .filter((tier) => tier.quantity > 0 || tier.value > 0)
    .sort((left, right) => left.quantity - right.quantity);
  const discountMessagePreview =
    String(initialValues.config.message || "").trim() || DEFAULT_BUNDLE_CONFIG.message;
  const activeWindowLabel = endsAtValue ? "Scheduled range" : "Starts and runs until removed";

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
        alignItems: "start",
      }}
    >
      <input type="hidden" name="intent" value={action} />
      <input type="hidden" name="startsAt" value={startsAtValue} />
      <input type="hidden" name="endsAt" value={endsAtValue} />
      <div style={{ display: "grid", gap: "1rem" }}>
        <s-box padding="base" borderWidth="base" borderRadius="large">
          <s-stack direction="block" gap="base">
            <SectionIntro
              step="1"
              title="Name your offer"
              description="Give the offer an internal name and add the message shoppers will see with their automatic discount. Shoppers do not enter a code. Then choose when it starts."
            />
            <s-text-field
              label="Offer name"
              name="title"
              defaultValue={initialValues.title}
            />
            <s-text-field
              label="Cart message"
              name="message"
              defaultValue={initialValues.config.message}
              helpText="Shown with the automatic discount in the cart or at checkout. This is not a coupon code."
            />
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="tight">
                <s-heading>When should this offer run?</s-heading>
                <s-paragraph>
                  Select when the offer starts and, optionally, when it ends.
                  Shopify activates scheduled offers at the selected start time.
                </s-paragraph>
                <RangePicker
                  showTime
                  allowEmpty={[false, true]}
                  format="DD MMM YYYY, HH:mm"
                  value={scheduleRange}
                  onChange={(range) => setScheduleRange(range || [null, null])}
                  style={{ width: "100%" }}
                  placeholder={["Start date and time", "End date and time (optional)"]}
                />
              </s-stack>
            </s-box>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="large">
          <s-stack direction="block" gap="base">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <SectionIntro
                step="2"
                title="Choose how shoppers save"
                description="For each quantity, choose a fixed price, a percentage discount, or a buy-X-get-Y-free offer."
              />
              <s-button type="button" variant="secondary" onClick={addTier}>
                Add another bundle option
              </s-button>
            </div>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {bundleTiers.map((tier, index) => (
                <s-box
                  key={index}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <input
                      type="hidden"
                      name="bundleTierQuantity"
                      value={tier.quantity}
                    />
                    <input
                      type="hidden"
                      name="bundleTierDiscountType"
                      value={tier.discountType}
                    />
                    <input
                      type="hidden"
                      name="bundleTierFreeQuantity"
                      value={tier.freeQuantity || 0}
                    />
                    <input
                      type="hidden"
                      name="bundleTierValue"
                      value={tier.value}
                    />
                    <s-text-field
                      label={`Option ${index + 1}: number of items`}
                      type="number"
                      value={String(tier.quantity)}
                      onInput={(event) =>
                        updateTier(index, "quantity", event.currentTarget.value)
                      }
                    />
                    <label style={{ display: "grid", gap: "0.35rem", fontWeight: 700 }}>
                      <span>How should shoppers save?</span>
                      <select
                        value={tier.discountType}
                        onChange={(event) => changeTierDiscountType(index, event.currentTarget.value)}
                        style={tierSelectStyle}
                      >
                        <option value="fixed_price">Set a fixed total bundle price</option>
                        <option value="percentage">Give a percentage off</option>
                        <option value="free">Give items free</option>
                      </select>
                    </label>
                    <s-text-field
                      label={tier.discountType === "percentage"
                        ? `Option ${index + 1}: percentage off`
                        : tier.discountType === "free"
                          ? `Option ${index + 1}: free items`
                        : `Option ${index + 1}: total bundle price`}
                      type="number"
                      min="0"
                      max={tier.discountType === "percentage" ? "100" : undefined}
                      value={String(tier.value)}
                      onInput={(event) =>
                        updateTier(index, "value", event.currentTarget.value)
                      }
                    />
                    {tier.discountType === "free" ? (
                      <s-text-field
                        label={`Option ${index + 1}: free quantity`}
                        type="number"
                        min="1"
                        value={String(tier.freeQuantity || 1)}
                        onInput={(event) =>
                          updateTier(index, "freeQuantity", event.currentTarget.value)
                        }
                      />
                    ) : null}
                    <p style={tierHintStyle}>
                      {tier.discountType === "percentage"
                        ? `Example: Buy ${tier.quantity || "this many"} items and get ${tier.value || "0"}% off.`
                        : tier.discountType === "free"
                          ? `Example: Buy ${tier.quantity || "this many"}, get ${tier.freeQuantity || "1"} free.`
                        : `Example: Buy ${tier.quantity || "this many"} items and pay ${tier.value || "your price"} in total.`}
                    </p>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <s-button
                        type="button"
                        variant="secondary"
                        tone="critical"
                        disabled={bundleTiers.length === 1}
                        onClick={() => removeTier(index)}
                      >
                        Remove
                      </s-button>
                    </div>
                  </div>
                </s-box>
              ))}
            </div>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="large">
          <s-stack direction="block" gap="base">
            <SectionIntro
              step="3"
              title="Choose eligible products"
              description="Choose collections for this offer, or leave them blank to include every product in your store."
            />
            {selectedCollectionIds.map((collectionId) => (
              <input
                key={collectionId}
                type="hidden"
                name="selectedCollectionIds"
                value={collectionId}
              />
            ))}
            {collections.length > 0 ? (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="block" gap="tight">
                      <s-paragraph>
                        {selectedCollectionTitles.length > 0
                          ? `${selectedCollectionTitles.length} collections selected`
                          : "All products"}
                      </s-paragraph>
                      <s-paragraph>
                        {selectedCollectionTitles.length > 0
                          ? selectedCollectionTitles.join(", ")
                          : "Every product in your store is included"}
                      </s-paragraph>
                    </s-stack>
                  </s-box>
                  <s-button type="button" variant="secondary" onClick={openCollectionPicker}>
                    {selectedCollectionTitles.length > 0
                      ? "Edit collections"
                      : "Choose collections"}
                  </s-button>
                </div>

              </div>
            ) : (
              <s-paragraph>
                No collections found. This discount will apply to all products.
              </s-paragraph>
            )}
          </s-stack>
        </s-box>

        {error ? (
          <s-banner tone="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <s-button type="submit" variant="primary" loading={loading}>
            {submitLabel}
          </s-button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="large"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-heading>Your offer at a glance</s-heading>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <SummaryItem
                label="When it runs"
                value={activeWindowLabel}
                detail={startsAtValue ? dayjs(startsAtValue).format("DD MMM YYYY, HH:mm") : "Not set"}
              />
              <SummaryItem
                label="Eligible products"
                value={selectedCollectionTitles.length > 0 ? "Selected collections" : "All products"}
                detail={
                  selectedCollectionTitles.length > 0
                    ? selectedCollectionTitles.join(", ")
                    : "Every product in your store can use this offer."
                }
              />
              <SummaryItem
                label="Cart message"
                value={discountMessagePreview}
                detail="Shoppers see this when the offer is applied."
              />
            </div>
          </s-stack>
        </s-box>

        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="large"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-heading>Shopper preview</s-heading>
            <s-paragraph>This is how your offer will work for eligible products.</s-paragraph>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>{initialValues.title}</s-heading>
                {sortedPreviewTiers.map((tier) => (
                  <s-paragraph key={`${tier.quantity}-${tier.discountType}-${tier.value}`}>
                    {tier.discountType === "percentage"
                      ? `Buy ${tier.quantity} and get ${tier.value}% off`
                      : tier.discountType === "free"
                        ? `Buy ${tier.quantity}, get ${tier.freeQuantity} free`
                      : `Buy ${tier.quantity} for ${tier.value}`}
                  </s-paragraph>
                ))}
                <s-paragraph>Applies to: {appliesToLabel}</s-paragraph>
                <s-paragraph>
                  Cart message: {discountMessagePreview}
                </s-paragraph>
              </s-stack>
            </s-box>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="large">
          <s-stack direction="block" gap="tight">
            <s-heading>Helpful tips</s-heading>
            <s-paragraph>
              You can mix offer types. For example, set “Buy 2 for 799” and “Buy 3, get 15% off”.
            </s-paragraph>
            <s-paragraph>
              Use each item quantity only once. For example, do not add two different offers for 3 items.
            </s-paragraph>
            <s-paragraph>
              Choose collections when the offer should apply to only some of
              your products.
            </s-paragraph>
          </s-stack>
        </s-box>
      </div>
    </div>
  );

  function addTier() {
    setBundleTiers((currentTiers) => [
      ...currentTiers,
      createEmptyTier(currentTiers),
    ]);
  }

  function updateTier(index, field, value) {
    setBundleTiers((currentTiers) =>
      currentTiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier,
      ),
    );
  }

  function changeTierDiscountType(index, discountType) {
    setBundleTiers((currentTiers) =>
      currentTiers.map((tier, tierIndex) => {
        if (tierIndex !== index) {
          return tier;
        }

        if (discountType === "percentage") {
          const existingValue = Number(tier.value);
          return {
            ...tier,
            discountType,
            // A fixed bundle price such as 799 can't become a valid percentage.
            value: existingValue > 0 && existingValue <= 100 ? tier.value : 10,
          };
        }

        return { ...tier, discountType, value: "" };
      }),
    );
  }

  function removeTier(index) {
    setBundleTiers((currentTiers) =>
      currentTiers.filter((_, tierIndex) => tierIndex !== index),
    );
  }

  async function openCollectionPicker() {
    const selected = await shopify.resourcePicker({
      type: "collection",
      action: selectedCollectionIds.length > 0 ? "select" : "add",
      multiple: true,
      selectionIds: selectedCollectionIds.map((id) => ({ id })),
    });

    if (selected) {
      setSelectedCollectionIds(selected.map((collection) => collection.id));
    }
  }
}

function SectionIntro({ step, title, description }) {
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          width: "fit-content",
        }}
      >
        <span
          style={{
            width: "1.8rem",
            height: "1.8rem",
            borderRadius: "999px",
            background: "#111827",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            fontSize: "0.85rem",
            fontWeight: 700,
          }}
        >
          {step}
        </span>
        <s-heading>{title}</s-heading>
      </div>
      <s-paragraph>{description}</s-paragraph>
    </div>
  );
}

function SummaryItem({ label, value, detail }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="tight">
        <s-paragraph>{label}</s-paragraph>
        <s-heading>{value}</s-heading>
        <s-paragraph>{detail}</s-paragraph>
      </s-stack>
    </s-box>
  );
}

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 16);
}

function toDayjs(value) {
  if (!value) {
    return null;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function createEmptyTier(currentTiers) {
  const highestQuantity = currentTiers.reduce((max, tier) => {
    const quantity = Number(tier.quantity) || 0;

    return Math.max(max, quantity);
  }, 1);

  return {
    quantity: highestQuantity + 1,
    freeQuantity: 0,
    discountType: "fixed_price",
    value: "",
  };
}

function toFormTier(tier) {
  return {
    quantity: tier?.quantity ?? 2,
    freeQuantity: tier?.freeQuantity ?? 0,
    discountType: ["percentage", "free"].includes(tier?.discountType) ? tier.discountType : "fixed_price",
    value: tier?.value ?? tier?.price ?? "",
  };
}

const tierSelectStyle = { width: "100%", border: "1px solid #aeb4bc", borderRadius: "0.6rem", padding: "0.7rem", fontSize: "1rem", background: "#ffffff" };
const tierHintStyle = { margin: 0, color: "#64748b", fontSize: "0.85rem", lineHeight: 1.45 };
