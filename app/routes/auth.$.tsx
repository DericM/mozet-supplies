
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Special-case the session-token endpoint to avoid auth loops & noisy logs.
// Shopify App Bridge frequently requests /auth/session-token to refresh JWTs.
// This endpoint must NOT trigger authenticate.admin.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // For App Bridge JWT refreshes, return 204 with no body to avoid rendering "null"
  if (url.pathname.endsWith("/auth/session-token")) {
    return new Response(null, { status: 204 });
  }
  // Let the Shopify helper return the appropriate Response/Redirect
  return authenticate.admin(request);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};