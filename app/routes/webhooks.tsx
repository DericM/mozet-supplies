import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureSkusForProduct } from "../lib/sku/assign";
import type { AdminClient } from "../lib/sku/types";

function isAdminClient(x: unknown): x is AdminClient {
  return !!x && typeof (x as { graphql?: unknown }).graphql === "function";
}
function getProductGidFromPayload(u: unknown): string | undefined {
  if (!u || typeof u !== "object") return undefined;
  const o = u as Record<string, unknown>;
  return typeof o.admin_graphql_api_id === "string"
    ? o.admin_graphql_api_id
    : typeof o.id === "string"
      ? o.id
      : undefined;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, admin, payload, shop } = await authenticate.webhook(request);
  console.log("[webhook]", shop, topic);

  // If `admin` is missing, you don’t have a stored offline session for this shop yet.
  if (!isAdminClient(admin)) {
    console.error("[webhook] No admin client; reinstall the app into", shop);
    return new Response("ok");
  }

  if (topic === "PRODUCTS_CREATE" || topic === "PRODUCTS_UPDATE") {
    const productGid = getProductGidFromPayload(payload);
    console.log("[webhook] productGid:", productGid);
    if (productGid) {
      try {
        const report = await ensureSkusForProduct(admin, productGid);
        console.log("[assign-report]", report);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (e?.text && typeof e.text === "function") {
          console.error("[assign-error status]", e.status);
          console.error("[assign-error body]", await e.text());
        } else {
          console.error("[assign-error]", e);
        }
      }
    }
  }
  return new Response();
};
