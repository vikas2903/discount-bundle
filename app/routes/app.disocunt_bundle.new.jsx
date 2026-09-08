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
    <s-page heading="Create bundle discount">
      <s-button
        slot="secondary-actions"
        onClick={() => navigate("/app/disocunt_bundle")}
      >
        Back to discounts
      </s-button> 
      <s-section align="center" size="large"  heading="New automatic discount">
        {loadError ? (
          <s-banner tone="critical">
            <s-paragraph>{loadError}</s-paragraph>
          </s-banner>
        ) : null}
        <s-paragraph>
          Create a bundle offer in three clear steps: basics, pricing tiers, and
          target collections.
        </s-paragraph>
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
      </s-section>
    </s-page>
  );
}
