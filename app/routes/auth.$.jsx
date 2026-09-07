import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// The session-token bounce route throws HTML that initializes App Bridge.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
