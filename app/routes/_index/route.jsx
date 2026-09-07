import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import { authenticate } from "../../shopify.server";
import { DASHBOARD_HOME_PATH } from "../../utils/billing.server";

// Shopify opens the app at its root URL. Authenticate that launch and hand it
// directly to the dashboard.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const isShopifyLaunch =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.get("embedded") === "1" ||
    url.searchParams.has("id_token");

  // A direct local visit has no Shopify context. Show the login screen rather
  // than asking the embedded-auth middleware to validate an incomplete launch.
  if (!isShopifyLaunch) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/auth/login" },
    });
  }

  const { redirect } = await authenticate.admin(request);
  return redirect(buildEmbeddedRedirectPath(DASHBOARD_HOME_PATH, request));
};

export const headers = (headersArgs) => boundary.headers(headersArgs);

// Render Shopify's App Bridge recovery response instead of the root error page.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

function buildEmbeddedRedirectPath(path, request) {
  const url = new URL(request.url);
  const search = url.searchParams.toString();

  return search ? `${path}?${search}` : path;
}
