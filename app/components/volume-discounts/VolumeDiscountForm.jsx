/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function VolumeDiscountForm({
  fetcher,
  form,
  setForm,
  collections,
  products,
  isEditing,
  editingDiscountId,
  editingSchedule,
  onCancelEdit,
  actionPath,
}) {
  const isSaving = fetcher.state !== "idle";
  const shopify = useAppBridge();
  const [scheduleRange, setScheduleRange] = useState(() => [
    toDateTimeInput(editingSchedule?.startsAt) || currentDateTimeInput(),
    toDateTimeInput(editingSchedule?.endsAt),
  ]);
  const selectedCollectionIds = form.selectedCollectionIds;
  const selectedProductIds = form.selectedProductIds;
  const productMode = form.productMode || "all";
  const selectedCollectionTitles = useMemo(() => {
    const selectedSet = new Set(selectedCollectionIds);

    return collections
      .filter((collection) => selectedSet.has(collection.id))
      .map((collection) => collection.title);
  }, [collections, selectedCollectionIds]);
  const selectedProductTitles = useMemo(() => {
    const productsById = new Map(products.map((product) => [product.id, product.title]));

    return selectedProductIds.map((id) => productsById.get(id) || id);
  }, [products, selectedProductIds]);
  const scheduleSummary = getScheduleSummary(scheduleRange);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const updateApplication = (field, value) => {
    updateField("application", { ...form.application, [field]: value });
  };

  const updateCombinations = (field, value) => {
    updateField("combinations", { ...form.combinations, [field]: value });
  };

  const addTier = () => {
    setForm((currentForm) => ({
      ...currentForm,
      tiers: [
        ...currentForm.tiers,
        {
          minQty: currentForm.tiers.length + 2,
          discountType: "percentage",
          discountValue: 5,
        },
      ],
    }));
  };

  const updateTier = (index, field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      tiers: currentForm.tiers.map((tier, tierIndex) =>
        tierIndex === index
          ? {
              ...tier,
              [field]: value,
            }
          : tier,
      ),
    }));
  };

  const removeTier = (index) => {
    setForm((currentForm) => ({
      ...currentForm,
      tiers: currentForm.tiers.filter((_, tierIndex) => tierIndex !== index),
    }));
  };

  const openCollectionPicker = async () => {
    const selected = await shopify.resourcePicker({
      type: "collection",
      action: selectedCollectionIds.length > 0 ? "select" : "add",
      multiple: true,
      selectionIds: selectedCollectionIds.map((id) => ({ id })),
    });

    if (selected) {
      updateField("selectedCollectionIds", selected.map((collection) => collection.id));
    }
  };

  const openProductPicker = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: selectedProductIds.length > 0 ? "select" : "add",
      multiple: true,
      selectionIds: selectedProductIds.map((id) => ({ id })),
    });

    if (selected) {
      updateField("selectedProductIds", selected.map((product) => product.id));
    }
  };

  return (
    <fetcher.Form method="post" action={actionPath}>
      <input type="hidden" name="intent" value={isEditing ? "update" : "create"} />
      <input type="hidden" name="discountId" value={editingDiscountId || ""} />
      <input
        type="hidden"
        name="startsAt"
        value={scheduleRange[0] || ""}
      />
      <input
        type="hidden"
        name="endsAt"
        value={scheduleRange[1] || ""}
      />
      <input type="hidden" name="config" value={JSON.stringify(form)} />

      <s-stack direction="block" gap="base">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="tight">
            <s-heading>How this offer works</s-heading>
            <s-paragraph>1. Name the offer and add an optional message for shoppers.</s-paragraph>
            <s-paragraph>2. Target all products, selected collections, or individual products.</s-paragraph>
            <s-paragraph>3. Set savings for different quantities, such as buy 2 and save 5%, or buy 3 and save 15%.</s-paragraph>
            <s-paragraph>4. Save the offer. Shopify applies it automatically when a cart qualifies—shoppers never need a discount code.</s-paragraph>
          </s-stack>
        </s-box>

        <s-text-field
          label="Offer name"
          value={form.title}
          onInput={(event) => updateField("title", getEventValue(event))}
        />

        <s-text-field
          label="Cart message"
          helpText="Shown with the automatic discount in the cart or at checkout. This is not a coupon code."
          value={form.message}
          onInput={(event) => updateField("message", getEventValue(event))}
        />

        {!isEditing ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-heading>Offer status</s-heading>
              <s-paragraph>
                New quantity offers are saved as inactive. Activate the offer from the quantity-offers list when you are ready for shoppers to use it.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : null}

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="tight">
            <s-heading>Schedule this offer</s-heading>
            <s-paragraph>
              Select a start date and time, with an optional end date and time.
              Shopify activates scheduled offers automatically.
            </s-paragraph>
            <div style={scheduleFieldsStyle}>
              <label style={scheduleFieldLabelStyle}>
                Start date and time
                <input
                  type="datetime-local"
                  value={scheduleRange[0] || ""}
                  onChange={(event) =>
                    setScheduleRange([event.target.value, scheduleRange[1]])
                  }
                  required
                  style={scheduleInputStyle}
                />
              </label>
              <label style={scheduleFieldLabelStyle}>
                End date and time (optional)
                <input
                  type="datetime-local"
                  value={scheduleRange[1] || ""}
                  min={scheduleRange[0] || undefined}
                  onChange={(event) =>
                    setScheduleRange([scheduleRange[0], event.target.value])
                  }
                  style={scheduleInputStyle}
                />
              </label>
            </div>
            <div style={scheduleSummaryStyle}>
              <strong>{scheduleSummary.label}</strong>
              <span>{scheduleSummary.detail}</span>
            </div>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Set quantity savings</s-heading>
            <s-paragraph>
              Add one option for each quantity you want to reward. When a shopper qualifies for more than one option, they receive the best matching saving.
            </s-paragraph>

            {form.tiers.map((tier, index) => (
              <s-box
                key={`tier-${index}`}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="tight">
                  <s-stack
                    direction="inline"
                    gap="tight"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-heading>Saving option {index + 1}</s-heading>
                    <s-button
                      type="button"
                      variant="tertiary"
                      onClick={() => removeTier(index)}
                      disabled={form.tiers.length === 1}
                    >
                      Remove
                    </s-button>
                  </s-stack>

                  <s-stack direction="inline" gap="tight">
                    <s-text-field
                      label="Number of items to buy"
                      type="number"
                      value={String(tier.minQty)}
                      onInput={(event) =>
                        updateTier(index, "minQty", Number(getEventValue(event)))
                      }
                    />

                    <s-text-field
                      label="Saving value"
                      type="number"
                      min="0"
                      max="100"
                      value={String(tier.discountValue)}
                      onInput={(event) =>
                        updateTier(
                          index,
                          "discountValue",
                          Number(getEventValue(event)),
                        )
                      }
                    />
                    <label style={{ display: "grid", gap: "0.35rem", fontWeight: 600 }}>
                      Discount type
                      <select
                        value={tier.discountType}
                        onChange={(event) =>
                          updateTier(index, "discountType", event.target.value)
                        }
                        style={selectStyle}
                      >
                        <option value="percentage">Percentage off</option>
                        <option value="fixed">Fixed amount off each item</option>
                      </select>
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}

            <s-button type="button" variant="secondary" onClick={addTier}>
              Add another saving option
            </s-button>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Discount application limits</s-heading>
            <s-paragraph>
              Control how many eligible cart lines can receive this volume discount.
            </s-paragraph>
            <div style={targetingOptionsStyle}>
              {[
                ["once", "Apply once per order", "Discount one qualifying product line."],
                ["repeat", "Apply to every qualifying line", "Discount all qualifying product lines."],
                ["limit", "Limit applications", "Set a maximum number of qualifying lines."],
              ].map(([value, label, detail]) => (
                <label key={value} htmlFor={`volume-application-${value}`} aria-label={label} style={{ ...targetOptionStyle, ...(form.application.method === value ? selectedTargetOptionStyle : {}) }}>
                  <input id={`volume-application-${value}`} type="radio" name="volume-application" checked={form.application.method === value} onChange={() => updateApplication("method", value)} />
                  <span style={{ display: "grid", gap: "0.2rem" }}><strong>{label}</strong><span style={{ color: "#64748b", fontSize: "0.88rem" }}>{detail}</span></span>
                </label>
              ))}
            </div>
            {form.application.method === "limit" ? (
              <s-text-field
                label="Maximum applications per order"
                type="number"
                min="1"
                value={String(form.application.maxApplications || "")}
                onInput={(event) => updateApplication("maxApplications", Number(getEventValue(event)))}
              />
            ) : null}
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Item priority</s-heading>
            <s-paragraph>When applications are limited, choose which qualifying product lines receive the saving first.</s-paragraph>
            <label style={{ display: "grid", gap: "0.35rem", fontWeight: 600 }}>
              Prioritize items by price
              <select value={form.application.priority} onChange={(event) => updateApplication("priority", event.target.value)} style={selectStyle}>
                <option value="cheapest">Cheapest eligible items first</option>
                <option value="most_expensive">Most expensive eligible items first</option>
              </select>
            </label>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Discount combinations</s-heading>
            <s-paragraph>Choose which other Shopify discount classes can combine with this offer.</s-paragraph>
            <div style={checkboxGridStyle}>
              {[["productDiscounts", "Product discounts"], ["orderDiscounts", "Order discounts"], ["shippingDiscounts", "Shipping discounts"]].map(([key, label]) => (
                <label key={key} style={checkboxOptionStyle}>
                  <input type="checkbox" checked={form.combinations[key]} onChange={(event) => updateCombinations(key, event.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Target this offer</s-heading>
            <s-paragraph>
              Choose exactly which products can receive this quantity saving. Existing selections are kept when you switch between targeting options.
            </s-paragraph>

            <div style={targetingOptionsStyle}>
              {[
                ["all", "All products", "Every product in your store can qualify."],
                ["collections", "Selected collections", "Limit the offer to products in chosen collections."],
                ["products", "Selected products", "Limit the offer to specific products."],
              ].map(([value, label, detail]) => (
                <label
                  key={value}
                  htmlFor={`volume-product-targeting-${value}`}
                  aria-label={label}
                  style={{
                    ...targetOptionStyle,
                    ...(productMode === value ? selectedTargetOptionStyle : {}),
                  }}
                >
                  <input
                    id={`volume-product-targeting-${value}`}
                    type="radio"
                    name="volume-product-targeting"
                    value={value}
                    checked={productMode === value}
                    onChange={() => updateField("productMode", value)}
                  />
                  <span style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>{label}</strong>
                    <span style={{ color: "#64748b", fontSize: "0.88rem" }}>{detail}</span>
                  </span>
                </label>
              ))}
            </div>

            {productMode === "collections" ? (
              <TargetPicker
                label={
                  selectedCollectionTitles.length > 0
                    ? `${selectedCollectionTitles.length} collection${selectedCollectionTitles.length === 1 ? "" : "s"} selected`
                    : "No collections selected"
                }
                description={
                  selectedCollectionTitles.length > 0
                    ? selectedCollectionTitles.join(", ")
                    : "Choose one or more collections for this offer."
                }
                buttonLabel={selectedCollectionTitles.length > 0 ? "Edit collections" : "Select collections"}
                onClick={openCollectionPicker}
              />
            ) : null}

            {productMode === "products" ? (
              <TargetPicker
                label={
                  selectedProductTitles.length > 0
                    ? `${selectedProductTitles.length} product${selectedProductTitles.length === 1 ? "" : "s"} selected`
                    : "No products selected"
                }
                description={
                  selectedProductTitles.length > 0
                    ? selectedProductTitles.join(", ")
                    : "Choose one or more products for this offer."
                }
                buttonLabel={selectedProductTitles.length > 0 ? "Edit products" : "Select products"}
                onClick={openProductPicker}
              />
            ) : null}
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>Eligible products &amp; customers</s-heading>
            <s-paragraph>Product targeting is set above. This offer is available to all customers unless you limit it to new customers.</s-paragraph>
            <label aria-label="New customers only" style={checkboxOptionStyle}>
              <input type="checkbox" checked={form.newCustomersOnly} onChange={(event) => updateField("newCustomersOnly", event.target.checked)} />
              <span><strong>New customers only</strong><br /><span style={{ color: "#64748b", fontSize: "0.88rem" }}>Apply only when Shopify identifies the customer as having no previous orders.</span></span>
            </label>
          </s-stack>
        </s-box>

        <s-stack direction="inline" gap="tight">
          <s-button type="submit" variant="primary" loading={isSaving}>
            {isEditing ? "Save changes" : "Create offer"}
          </s-button>
          {isEditing ? (
            <s-button type="button" variant="secondary" onClick={onCancelEdit}>
              Cancel
            </s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

function TargetPicker({ label, description, buttonLabel, onClick }) {
  return (
    <div style={collectionSelectionStyle}>
      <div style={{ display: "grid", gap: "0.3rem", minWidth: 0 }}>
        <strong>{label}</strong>
        <span style={{ color: "#64748b", overflowWrap: "anywhere" }}>{description}</span>
      </div>
      <s-button type="button" variant="secondary" onClick={onClick}>
        {buttonLabel}
      </s-button>
    </div>
  );
}

function getEventValue(event) {
  return (
    event?.currentTarget?.value ??
    event?.target?.value ??
    event?.detail?.value ??
    ""
  );
}

function toDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : formatDateTimeInput(parsed);
}

function getScheduleSummary(range) {
  const [startsAt, endsAt] = range;

  if (!startsAt) {
    return { label: "Choose a start time", detail: "The offer cannot be scheduled yet." };
  }

  const startsLabel = formatScheduleTime(startsAt);
  if (!endsAt) {
    return { label: "Starts automatically", detail: `${startsLabel} and continues until you turn it off.` };
  }

  return {
    label: "Scheduled time range",
    detail: `${startsLabel} to ${formatScheduleTime(endsAt)}`,
  };
}

function currentDateTimeInput() {
  return formatDateTimeInput(new Date());
}

function formatDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatScheduleTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const scheduleSummaryStyle = {
  display: "grid",
  gap: "0.2rem",
  padding: "0.7rem 0.8rem",
  borderRadius: "0.65rem",
  background: "#eff6ff",
  color: "#1e3a8a",
  fontSize: "0.9rem",
};

const scheduleFieldsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
  gap: "0.75rem",
};

const scheduleFieldLabelStyle = {
  display: "grid",
  gap: "0.35rem",
  fontWeight: 600,
};

const scheduleInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: "2.5rem",
  padding: "0.5rem 0.65rem",
  border: "1px solid #8a8a8a",
  borderRadius: "0.5rem",
  font: "inherit",
};

const collectionSelectionStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "0.85rem",
  border: "1px solid #dbe4f0",
  borderRadius: "0.75rem",
  background: "#f8fafc",
};

const targetingOptionsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  gap: "0.65rem",
};

const targetOptionStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.55rem",
  padding: "0.8rem",
  border: "1px solid #dbe4f0",
  borderRadius: "0.7rem",
  background: "#ffffff",
  cursor: "pointer",
};

const selectedTargetOptionStyle = {
  borderColor: "#0f766e",
  background: "#f0fdfa",
  boxShadow: "inset 0 0 0 1px #0f766e",
};

const selectStyle = {
  width: "100%",
  minHeight: "2.5rem",
  padding: "0.5rem 0.65rem",
  border: "1px solid #8a8a8a",
  borderRadius: "0.5rem",
  background: "#ffffff",
  font: "inherit",
};

const checkboxGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  gap: "0.65rem",
};

const checkboxOptionStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.55rem",
  padding: "0.75rem",
  border: "1px solid #dbe4f0",
  borderRadius: "0.65rem",
  background: "#f8fafc",
};
