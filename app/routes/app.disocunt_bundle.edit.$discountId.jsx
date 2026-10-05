import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { BundleDiscountForm } from "../components/bundle-discount/BundleDiscountForm";
import {
  getBundleCollections,
  getBundleDiscount,
  resolveFunctionHandle,
  toggleBundleDiscountStatus,
  updateBundleDiscount,
} from "../services/bundle-discount.server";
import { authenticate } from "../shopify.server";
import {
  buildBundleConfig,
  toErrorMessage,
  toIsoDateTime,
  validateBundleConfig,
} from "../utils/bundle-discount";
import { checkSubscription, getBillingPathWithShop } from "../utils/billing.server";

export const loader = async ({ request, params }) => {
  const { admin, billing, redirect, session } = await authenticate.admin(request);
  if (!(await checkSubscription(billing))) {
    return redirect(getBillingPathWithShop(request, session));
  }
  const [collectionsResult, discountResult] = await Promise.all([
    getBundleCollections(admin),
    getBundleDiscount(admin, params.discountId),
  ]);

  if (!discountResult.discount) {
    throw new Response("Bundle discount not found", { status: 404 });
  }

  return {
    collections: collectionsResult.collections,
    discount: discountResult.discount,
    loadError: [
      ...collectionsResult.graphqlErrors.map(({ message }) => message),
      ...discountResult.graphqlErrors.map(({ message }) => message),
    ].join(" | ") || null,
  };
};

export const action = async ({ request, params }) => {
  const { admin, billing, redirect, session } = await authenticate.admin(request);
  if (!(await checkSubscription(billing))) {
    return redirect(getBillingPathWithShop(request, session));
  }
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "toggle-status") {
    const nextStatus = String(formData.get("nextStatus") || "").trim();

    if (!["enable", "disable"].includes(nextStatus)) {
      return {
        ok: false,
        error: "The discount status could not be updated.",
      };
    }

    try {
      const result = await toggleBundleDiscountStatus(admin, {
        id: params.discountId,
        nextStatus,
      });

      if (result.ok) {
        return redirect(`/app/disocunt_bundle/edit/${encodeURIComponent(params.discountId)}`);
      }

      return {
        ok: false,
        error: [
          ...result.userErrors.map(({ message }) => message),
          ...result.graphqlErrors.map(({ message }) => message),
        ].join(" | "),
      };
    } catch (error) {
      if (error instanceof Response) throw error;
      return {
        ok: false,
        error: toErrorMessage(error),
      };
    }
  }

  const { config, invalidCollectionIds, invalidProductIds, invalidSegmentIds } = buildBundleConfig(formData);
  const validationErrors = validateBundleConfig(
    config,
    formData.getAll("bundleTierQuantity").length,
  );

  if (invalidCollectionIds.length > 0 || invalidProductIds.length > 0 || invalidSegmentIds.length > 0) {
    return {
      ok: false,
      error:
        "Collection, product, and customer segment values must be numeric IDs or Shopify GIDs.",
    };
  }

  if (validationErrors.length > 0) {
    return {
      ok: false,
      error: validationErrors.join(" | "),
    };
  }

  try {
    const existing = await getBundleDiscount(admin, params.discountId);
    // Keep discounts created by the previous builder on their original
    // calculation path. Editing a legacy discount must not silently turn it
    // into the newer product-discount implementation.
    const configToSave =
      Number(existing.discount?.config?.version) < 2
        ? { ...config, version: 1 }
        : config;
    const result = await updateBundleDiscount(admin, {
      id: params.discountId,
      title: formData.get("title"),
      startsAt: toIsoDateTime(formData.get("startsAt")),
      endsAt: toIsoDateTime(formData.get("endsAt")),
      functionHandle: resolveFunctionHandle(),
      config: configToSave,
      previousConfig: existing.discount?.config,
    });

    if (result.ok) {
      return redirect("/app/disocunt_bundle");
    }

    return {
      ok: false,
      error: [
        ...result.userErrors.map(({ message }) => message),
        ...result.graphqlErrors.map(({ message }) => message),
      ].join(" | "),
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false,
      error: toErrorMessage(error),
    };
  }
};

export default function EditBundleDiscountPage() {
  const { collections, discount, loadError } = useLoaderData();
  const actionData = useActionData();
  const statusFetcher = useFetcher();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isActive = discount.status === "ACTIVE";

  return (
    <s-page>
      <div className="bundle-page-shell">
        <div className="bundle-page-header">
          <div>
            <h1>Edit bundle discount</h1>
            <p>Update this offer without recreating the active Shopify discount.</p>
          </div>
          <div className="bundle-header-actions">
            <button
              className="bundle-button bundle-back-button"
              type="button"
              onClick={() => navigate("/app/disocunt_bundle")}
            >
              Back to discounts
            </button>
            <statusFetcher.Form method="post">
              <input type="hidden" name="intent" value="toggle-status" />
              <input
                type="hidden"
                name="nextStatus"
                value={isActive ? "disable" : "enable"}
              />
              <button
                className="bundle-button"
                type="submit"
                disabled={statusFetcher.state !== "idle"}
              >
                {isActive ? "Deactivate" : "Activate"}
              </button>
            </statusFetcher.Form>
          </div>
        </div>
        {loadError ? (
          <s-banner tone="critical">
            <s-paragraph>{loadError}</s-paragraph>
          </s-banner>
        ) : null}
        {statusFetcher.data?.error ? (
          <s-banner tone="critical">
            <s-paragraph>{statusFetcher.data.error}</s-paragraph>
          </s-banner>
        ) : null}
        <Form method="post">
          <BundleDiscountForm
            action="update"
            collections={collections}
            defaultValues={discount}
            submitLabel="Save changes"
            loading={navigation.state === "submitting"}
            error={actionData?.error}
          />
        </Form>
      </div>
    </s-page>
  );
}
