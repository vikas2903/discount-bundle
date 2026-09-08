import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Shopify Admin can launch an embedded app at an app-handle path. Route those
// authenticated launches to the dashboard rather than showing a 404.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const isEmbeddedLaunch =
    url.searchParams.get("embedded") === "1" ||
    url.searchParams.has("host") ||
    url.searchParams.has("id_token");

  if (isEmbeddedLaunch) {
    const { redirect } = await authenticate.admin(request);
    return redirect(buildEmbeddedRedirectPath("/app", request));
  }

  throw new Response("Not Found", { status: 404 });
};

export const headers = (headersArgs) => boundary.headers(headersArgs);

function buildEmbeddedRedirectPath(path, request) {
  const url = new URL(request.url);
  const search = url.searchParams.toString();

  return search ? `${path}?${search}` : path;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
