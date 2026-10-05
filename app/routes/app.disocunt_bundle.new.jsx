import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { BundleDiscountForm } from "../components/bundle-discount/BundleDiscountForm";
import {
  createBundleDiscount,
  getBundleCollections,
  resolveFunctionHandle,
} from "../services/bundle-discount.server";
import { authenticate } from "../shopify.server";
import {
  buildBundleConfig,
  toErrorMessage,
  toIsoDateTime,
  validateBundleConfig,
} from "../utils/bundle-discount";
import { checkSubscription, getBillingPathWithShop } from "../utils/billing.server";

export const loader = async ({ request }) => {
  const { admin, billing, redirect, session } = await authenticate.admin(request);
  if (!(await checkSubscription(billing))) {
    return redirect(getBillingPathWithShop(request, session));
  }
  const { collections, graphqlErrors } = await getBundleCollections(admin);

  return {
    collections,
    loadError: graphqlErrors.map(({ message }) => message).join(" | ") || null,
  };
};

export const action = async ({ request }) => {
  const { admin, billing, redirect, session } = await authenticate.admin(request);
  if (!(await checkSubscription(billing))) {
    return redirect(getBillingPathWithShop(request, session));
  }
  const formData = await request.formData();
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
    const result = await createBundleDiscount(admin, {
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

export default function NewBundleDiscountPage() {
  const { collections, loadError } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();

  return (
    <s-page>
      <div className="bundle-page-shell">
        <div className="bundle-page-header">
          <div>
            <h1>Create a bundle discount</h1>
            <p>Configure your offer, control how it applies, and preview the customer experience.</p>
          </div>
          <button
            className="bundle-button bundle-back-button"
            type="button"
            onClick={() => navigate("/app/disocunt_bundle")}
          >
            Back to discounts
          </button>
        </div>
        {loadError ? (
          <s-banner tone="critical">
            <s-paragraph>{loadError}</s-paragraph>
          </s-banner>
        ) : null}
        <Form method="post">
          <BundleDiscountForm
            action="create"
            collections={collections}
            defaultValues={null}
            submitLabel="Create discount"
            loading={navigation.state === "submitting"}
            error={actionData?.error}
          />
        </Form>
      </div>
    </s-page>
  );
}
