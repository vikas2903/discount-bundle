import { redirect } from "react-router";
import { DASHBOARD_HOME_PATH } from "../../utils/billing.server";

// Forward the launch to the protected app layout, which initializes App Bridge
// and handles authentication. The root route does not access merchant data.
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

  return redirect(buildEmbeddedRedirectPath(DASHBOARD_HOME_PATH, request));
};

function buildEmbeddedRedirectPath(path, request) {
  const url = new URL(request.url);
  const search = url.searchParams.toString();

  return search ? `${path}?${search}` : path;
}
