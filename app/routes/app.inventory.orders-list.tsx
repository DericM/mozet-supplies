/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Page, Card, IndexTable, Text, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

type ReorderRow = {
  id: string; // Variant GID
  sku: string | null;
  title: string;
  productTitle: string;
  vendor: string | null;
  soldWindowDays: number;
  soldQty: number;
  velocityPerDay: number;
  onHand: number;
  incoming: number;
  daysOfCover: number; // based on onHand only
  reorderPoint: number;
  suggestedOrderQty: number;
};

const DEFAULT_WINDOW_DAYS = 180; // 6 months
const DEFAULT_LEAD_TIME_DAYS = 14;
const DEFAULT_TARGET_COVER_DAYS = 21; // aim to have 3 weeks on hand after ordering

export async function loader({ request }: LoaderFunctionArgs) {
  try {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  // Respect API scope limits: without read_all_orders Shopify only allows 60 days of order history
  const scopes = new Set<string>((session?.scope || "").split(",").filter(Boolean));
  const hasReadAllOrders = scopes.has("read_all_orders");
  const scopeWindowCap = hasReadAllOrders ? 180 : 60;
  const windowDays = Math.max(
    1,
    Math.min(scopeWindowCap, Number(url.searchParams.get("windowDays")) || Math.min(DEFAULT_WINDOW_DAYS, scopeWindowCap))
  );
  const leadTimeDays = Math.max(
    0,
    Math.min(120, Number(url.searchParams.get("leadTimeDays")) || DEFAULT_LEAD_TIME_DAYS)
  );
  const targetCoverDays = Math.max(
    0,
    Math.min(365, Number(url.searchParams.get("targetCoverDays")) || DEFAULT_TARGET_COVER_DAYS)
  );

  // Build Orders query string for the window
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
  const orderQuery = `created_at:>=${since} financial_status:paid status:any`;

  // Allow local testing with a fixture: use ?mock=1 or set USE_MOCK=1
  const useMock = url.searchParams.get("mock") === "1" || process.env.USE_MOCK === "1";
  if (useMock) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const p = path.join(process.cwd(), "app", "data", "mock-reorder.json");
      const raw = await fs.readFile(p, "utf8");
      const obj = JSON.parse(raw);
      return obj;
    } catch (err) {
      return {
        items: [] as any[],
        windowDays,
        leadTimeDays,
        targetCoverDays,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // Paginate through recent orders (cap to avoid heavy loads)
  const variantSales: Map<string, number> = new Map(); // variant GID -> qty
  let after: string | null = null;
  let fetched = 0;
  const MAX_ORDERS = 250; // hard cap to keep loader responsive
  while (true) {
    const resp = await admin.graphql(
      `#graphql
      query OrdersWindow($first:Int!,$after:String,$query:String){
        orders(first:$first, after:$after, query:$query, sortKey:CREATED_AT, reverse:true){
          edges{
            cursor
            node{
              id
              createdAt
              lineItems(first: 100){
                nodes{
                  quantity
                  variant{ id sku }
                }
              }
            }
          }
          pageInfo{ hasNextPage }
        }
      }`,
      { variables: { first: Math.min(50, MAX_ORDERS - fetched), after, query: orderQuery } }
    );
    const json = await resp.json();
    const connection = json?.data?.orders;
    const edges: any[] = connection?.edges ?? [];
    for (const e of edges) {
      fetched += 1;
      const items = e?.node?.lineItems?.nodes ?? [];
      for (const li of items) {
        const v = li?.variant;
        if (!v?.id) continue;
        const qty = Number(li?.quantity || 0);
        if (!qty) continue;
        variantSales.set(v.id, (variantSales.get(v.id) || 0) + qty);
      }
    }
    if (!connection?.pageInfo?.hasNextPage || fetched >= MAX_ORDERS) break;
    after = edges.length ? edges[edges.length - 1].cursor : null;
    if (!after) break;
  }

  const variantIds = Array.from(variantSales.keys());
  if (variantIds.length === 0) {
    return {
      items: [] as ReorderRow[],
      windowDays,
      leadTimeDays,
      targetCoverDays,
      generatedAt: new Date().toISOString(),
    };
  }

  // Fetch inventory and product info for these variants
  const batchedIds: string[][] = [];
  for (let i = 0; i < variantIds.length; i += 200) batchedIds.push(variantIds.slice(i, i + 200));

  const rows: ReorderRow[] = [];
  for (const batch of batchedIds) {
    const vResp = await admin.graphql(
      `#graphql
      query VariantInv($ids:[ID!]!){
        nodes(ids:$ids){
          id
          ... on ProductVariant{
            id
            sku
            title
            product{ title vendor }
            inventoryItem{
              id
              inventoryLevels(first: 100){
                nodes{
                  quantities(names: ["AVAILABLE", "INCOMING"]) { name quantity }
                  location{ id name }
                }
              }
            }
          }
        }
      }`,
      { variables: { ids: batch } }
    );
    const vJson = await vResp.json();
    const nodes: any[] = vJson?.data?.nodes ?? [];
    for (const n of nodes) {
      if (!n?.id) continue;
      const soldQty = Number(variantSales.get(n.id) || 0);
      const velocity = soldQty / windowDays;
      const levels: any[] = n?.inventoryItem?.inventoryLevels?.nodes ?? [];
      const onHand = levels.reduce((acc, lvl) => {
        const qs: any[] = lvl?.quantities ?? [];
        const avail = qs.find((q) => q?.name === "AVAILABLE")?.quantity ?? 0;
        return acc + Number(avail || 0);
      }, 0);
      const incoming = levels.reduce((acc, lvl) => {
        const qs: any[] = lvl?.quantities ?? [];
        const inc = qs.find((q) => q?.name === "INCOMING")?.quantity ?? 0;
        return acc + Number(inc || 0);
      }, 0);
      let daysOfCover: number;
      if (velocity <= 0) {
        daysOfCover = Infinity;
      } else if (onHand + incoming === 0) {
        // If we've been completely out of stock (no on-hand and no incoming),
        // represent severity as negative cover equal to the window length.
        daysOfCover = -windowDays;
      } else {
        daysOfCover = onHand / velocity;
      }
      const reorderPoint = velocity * leadTimeDays;
      const targetStock = velocity * targetCoverDays;
      const suggestedOrderQty = Math.max(0, Math.ceil(targetStock - onHand - incoming));

      // Only include items that need ordering and have some sales velocity
      if (velocity > 0 && onHand + incoming < reorderPoint) {
        rows.push({
          id: n.id,
          sku: n.sku ?? null,
          title: String(n.title || "Variant"),
          productTitle: String(n?.product?.title || "Product"),
          vendor: n?.product?.vendor ?? null,
          soldWindowDays: windowDays,
          soldQty,
          velocityPerDay: velocity,
          onHand,
          incoming,
          daysOfCover,
          reorderPoint,
          suggestedOrderQty,
        });
      }
    }
  }

  // Sort by lowest days of cover, then highest velocity
  rows.sort((a, b) => {
    const aDoc = isFinite(a.daysOfCover) ? a.daysOfCover : 1e9;
    const bDoc = isFinite(b.daysOfCover) ? b.daysOfCover : 1e9;
    if (aDoc !== bDoc) return aDoc - bDoc;
    return b.velocityPerDay - a.velocityPerDay;
  });

  return {
    items: rows,
    windowDays,
    leadTimeDays,
    targetCoverDays,
    generatedAt: new Date().toISOString(),
  };
  } catch (err: any) {
    console.error("InventoryOrdersList loader error:", err);
    let message = err?.message || String(err);
    // Provide actionable help for common Shopify scope issues
    if (typeof message === "string" && message.includes("Access denied for orders field")) {
      message +=
        "\n\nFix: Grant the app the read_orders scope (and optionally read_all_orders for >60 days)." +
        "\nAdd to SCOPES in your .env: read_orders,read_all_orders,read_inventory,read_locations" +
        "\nThen restart the server and re-authenticate the app (visit /auth).";
    }
    if (typeof message === "string" && message.includes("Field 'available' doesn't exist on type 'InventoryLevel'")) {
      message +=
        "\n\nFix: You're on a newer API version where InventoryLevel.available/incoming were removed." +
        "\nThis route has been updated to use InventoryLevel.quantities(names: [AVAILABLE, INCOMING])." +
        "\nIf you still see this, ensure your app is running the latest build and clear any server cache.";
    }
    if (typeof message === "string" && message.includes("Argument 'names' on Field 'quantities' has an invalid value")) {
      message +=
        "\n\nFix: The 'names' argument expects a list of strings. It has been corrected to [\"AVAILABLE\", \"INCOMING\"]." +
        "\nRedeploy and hard refresh to ensure the latest build is active.";
    }
    return {
      items: [] as ReorderRow[],
      windowDays: Number(new URL(request.url).searchParams.get("windowDays")) || DEFAULT_WINDOW_DAYS,
      leadTimeDays: Number(new URL(request.url).searchParams.get("leadTimeDays")) || DEFAULT_LEAD_TIME_DAYS,
      targetCoverDays: Number(new URL(request.url).searchParams.get("targetCoverDays")) || DEFAULT_TARGET_COVER_DAYS,
      generatedAt: new Date().toISOString(),
      error: {
        message,
        stack: err?.stack,
      },
    };
  }
}

export default function InventoryOrdersList() {
  const { items, windowDays, leadTimeDays, targetCoverDays, error } = useLoaderData() as {
    items: ReorderRow[];
    windowDays: number;
    leadTimeDays: number;
    targetCoverDays: number;
    generatedAt: string;
    error?: { message: string; stack?: string };
  };

  return (
    <Page title="Inventory Reorder Priorities" subtitle={`Window ${windowDays}d • Lead ${leadTimeDays}d • Target cover ${targetCoverDays}d`}>
      {error && (
        <Card sectioned title="Loader Error">
          <Text as="p" color="critical">{error.message}</Text>
          {error.stack && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{error.stack}</pre>}
        </Card>
      )}
      <Card>
        <IndexTable
          resourceName={{ singular: "variant", plural: "variants" }}
          itemCount={items.length}
          selectable={false}
          headings={[
            { title: "Product" },
            { title: "Variant" },
            { title: "Vendor" },
            { title: "SKU" },
            { title: `Sold (${windowDays}d)` },
            { title: "Velocity/d" },
            { title: "On hand" },
            { title: "Incoming" },
            { title: "Days cover" },
            { title: "Reorder pt" },
            { title: "Suggest qty" },
          ]}
        >
          {items.map((it, idx) => (
            <IndexTable.Row id={it.id} key={it.id} position={idx}>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{it.productTitle}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>{it.title}</IndexTable.Cell>
              <IndexTable.Cell>{it.vendor || "—"}</IndexTable.Cell>
              <IndexTable.Cell>{it.sku || "—"}</IndexTable.Cell>
              <IndexTable.Cell>{it.soldQty}</IndexTable.Cell>
              <IndexTable.Cell>{it.velocityPerDay.toFixed(2)}</IndexTable.Cell>
              <IndexTable.Cell>{it.onHand}</IndexTable.Cell>
              <IndexTable.Cell>{it.incoming}</IndexTable.Cell>
              <IndexTable.Cell>
                {Number.isFinite(it.daysOfCover) ? it.daysOfCover.toFixed(1) : "∞"}
                {it.daysOfCover < leadTimeDays && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="critical">Risk</Badge>
                  </span>
                )}
              </IndexTable.Cell>
              <IndexTable.Cell>{Math.ceil(it.reorderPoint)}</IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="bold">{it.suggestedOrderQty}</Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
