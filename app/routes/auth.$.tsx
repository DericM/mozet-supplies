
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Special-case the session-token endpoint to avoid auth loops & noisy logs.
// Shopify App Bridge frequently requests /auth/session-token to refresh JWTs.
// This endpoint must NOT trigger authenticate.admin.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname.includes("/auth/session-token")) {
    return null;
  }

  await authenticate.admin(request);
  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};