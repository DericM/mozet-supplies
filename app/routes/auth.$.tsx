
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate, login } from "../shopify.server";
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
  // Use Shopify helper; if it returns a Response (redirect, etc.), forward it.
  // Otherwise, suppress any loader data by returning 204 No Content so nothing renders as text.
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  // If we have a session but the scopes are missing compared to configured SCOPES, force reauth
  const required = new Set((process.env.SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean));
  const current = new Set((result?.session?.scope || "").split(",").map((s) => s.trim()).filter(Boolean));
  const missing = Array.from(required).some((s) => !current.has(s));
  if (missing) {
    const shop = result?.session?.shop;
    if (shop) {
      // Redirect to login route with shop param to trigger OAuth with new scopes
      return new Response(null, { status: 302, headers: { Location: `/auth/login?shop=${encodeURIComponent(shop)}` } });
    }
    // Fall back to generic login helper
    return login(request);
  }

  return new Response(null, { status: 204 });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};