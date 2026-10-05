/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function VolumeDiscountForm({
  fetcher,
  form,
  setForm,
  collections,
  isEditing,
  editingDiscountId,
  editingSchedule,
  onCancelEdit,
}) {
  const isSaving = fetcher.state !== "idle";
  const shopify = useAppBridge();
  const [scheduleRange, setScheduleRange] = useState(() => [
    toDateTimeInput(editingSchedule?.startsAt) || currentDateTimeInput(),
    toDateTimeInput(editingSchedule?.endsAt),
  ]);
  const selectedCollectionIds = form.selectedCollectionIds;
  const selectedCollectionTitles = useMemo(() => {
    const selectedSet = new Set(selectedCollectionIds);

    return collections
      .filter((collection) => selectedSet.has(collection.id))
      .map((collection) => collection.title);
  }, [collections, selectedCollectionIds]);
  const scheduleSummary = getScheduleSummary(scheduleRange);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
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

  return (
    <fetcher.Form method="post">
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
            <s-paragraph>2. Choose products, or leave this blank to include your whole store.</s-paragraph>
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
                      label="Saving percentage"
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
            <s-heading>Choose eligible products</s-heading>
            <s-paragraph>
              Leave this blank to include every product in your store. Choose collections to limit the offer to certain products.
            </s-paragraph>

            <div style={collectionSelectionStyle}>
              <div style={{ display: "grid", gap: "0.3rem", minWidth: 0 }}>
                <strong>
                  {selectedCollectionTitles.length > 0
                    ? `${selectedCollectionTitles.length} collection${selectedCollectionTitles.length === 1 ? "" : "s"} selected`
                    : "All products"}
                </strong>
                <span style={{ color: "#64748b", overflowWrap: "anywhere" }}>
                  {selectedCollectionTitles.length > 0
                    ? selectedCollectionTitles.join(", ")
                    : "Every product in your store is eligible."}
                </span>
              </div>
              <s-button type="button" variant="secondary" onClick={openCollectionPicker}>
                {selectedCollectionTitles.length > 0 ? "Edit collections" : "Select collections"}
              </s-button>
            </div>
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
