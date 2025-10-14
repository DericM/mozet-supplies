// app/routes/app.health.tsx
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  console.log("[health] scope:", session.scope); // should include read_products,write_products

  const res = await admin.graphql(`{ shop { id name } }`);

  const json = await res.json();
  return new Response(JSON.stringify({ shop: session.shop, ok: res.ok, json }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};


export default function Health() {
  return <div style={{ padding: 16 }}>✅ App route is rendering</div>;
}