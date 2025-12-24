import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    id: session?.id,
    shop: session?.shop,
    isOnline: session?.isOnline,
    scope: session?.scope,
  };
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function DebugSession() {
  const data = useLoaderData() as {
    id?: string;
    shop?: string;
    isOnline?: boolean;
    scope?: string | null;
  };
  return (
    <div style={{ padding: 16 }}>
      <h2>Session Debug</h2>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>
      <p>Route: /app/debug/session</p>
    </div>
  );
}
