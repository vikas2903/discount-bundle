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

  const { config, invalidCollectionIds } = buildBundleConfig(formData);
  const validationErrors = validateBundleConfig(
    config,
    formData.getAll("bundleTierQuantity").length,
  );

  if (invalidCollectionIds.length > 0) {
    return {
      ok: false,
      error:
        "Collection IDs must be numeric IDs or Shopify GIDs like gid://shopify/Collection/123.",
    };
  }

  if (validationErrors.length > 0) {
    return {
      ok: false,
      error: validationErrors.join(" | "),
    };
  }

  try {
    const result = await updateBundleDiscount(admin, {
      id: params.discountId,
      title: formData.get("title"),
      startsAt: toIsoDateTime(formData.get("startsAt")),
      endsAt: toIsoDateTime(formData.get("endsAt")),
      functionHandle: resolveFunctionHandle(),
      config,
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
    <s-page heading="Edit bundle discount">
      <s-button
        slot="secondary-actions"
        onClick={() => navigate("/app/disocunt_bundle")}
      >
        Back to discounts
      </s-button>
      <statusFetcher.Form method="post">
        <input type="hidden" name="intent" value="toggle-status" />
        <input
          type="hidden"
          name="nextStatus"
          value={isActive ? "disable" : "enable"}
        />
        <s-button
          slot="primary-action"
          type="submit"
          variant="secondary"
          loading={statusFetcher.state !== "idle"}
        >
          {isActive ? "Deactivate" : "Activate"}
        </s-button>
      </statusFetcher.Form>
      <s-section heading={discount.title}>
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
        <s-paragraph>
          Update this bundle with a clearer setup flow for pricing, timing, and
          target collections without recreating the discount.
        </s-paragraph>
        <s-paragraph>
          Current status: {isActive ? "Active" : "Inactive"}
        </s-paragraph>
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
      </s-section>
    </s-page>
  );
}
