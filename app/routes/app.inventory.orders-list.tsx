/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useEffect, useRef, useState } from "react";
import { useLoaderData, useLocation, useNavigate, useNavigation } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Page, Card, IndexTable, Text, TextField, Thumbnail } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { toNumericId } from "../lib/search";

type ReorderRow = {
  id: string; // Variant GID
  sku: string | null;
  title: string;
  productId?: string | null;
  productTitle: string;
  productImage?: string | null;
  vendor: string | null;
  priceAmount: number | null;
  currencyCode: string | null;
  soldWindowDays: number;
  soldQty: number;
  velocityPerDay: number;
  onHand: number;
  incoming: number;
  daysOfCover: number; // based on onHand only
  reorderPoint: number;
  suggestedOrderQty: number;
  estLostRevenue30d: number;
};

const DEFAULT_WINDOW_DAYS = 730; // 2 years
const DEFAULT_LEAD_TIME_DAYS = 30;
const DEFAULT_TARGET_COVER_DAYS = 365; // aim to have ~1 year on hand after ordering

const PLACEHOLDER_IMG =
  "https://cdn.shopify.com/s/images/admin/no-image-compact-illustration.svg";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || null;
  // Fetch shop currency code once for formatting
  let shopCurrency: string | null = null;
  try {
    const shopResp = await admin.graphql(`#graphql\n{ shop { currencyCode } }`);
    const shopJson = await shopResp.json();
    shopCurrency = shopJson?.data?.shop?.currencyCode || null;
  } catch {
    shopCurrency = null;
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  // Respect API scope limits: without read_all_orders Shopify only allows 60 days of order history
  const scopes = new Set<string>((session?.scope || "").split(",").filter(Boolean));
  const hasReadAllOrders = scopes.has("read_all_orders");
  // Allow up to 2 years if read_all_orders is granted; otherwise cap to 60 days
  const scopeWindowCap = hasReadAllOrders ? 730 : 60;
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
  const sinceDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString().slice(0, 10); // YYYY-MM-DD
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
      return { ...obj, q, shop };
    } catch (err) {
      return {
        items: [] as any[],
        windowDays,
        leadTimeDays,
        targetCoverDays,
        generatedAt: new Date().toISOString(),
        q,
        shop,
      };
    }
  }

  // Paginate through recent orders (cap to avoid heavy loads)
  type VariantSalesInfo = { qty: number; firstAt?: string; lastAt?: string };
  const variantSales: Map<string, VariantSalesInfo> = new Map(); // variant GID -> info
  let after: string | null = null;
  let fetched = 0;
  const MAX_ORDERS = 250; // hard cap to keep loader responsive
  // eslint-disable-next-line no-constant-condition
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
      const createdAt: string | undefined = e?.node?.createdAt;
      const items = e?.node?.lineItems?.nodes ?? [];
      for (const li of items) {
        const v = li?.variant;
        if (!v?.id) continue;
        const qty = Number(li?.quantity || 0);
        if (!qty) continue;
        const info = variantSales.get(v.id) || { qty: 0 };
        info.qty += qty;
        if (createdAt) {
          if (!info.firstAt || createdAt < info.firstAt) info.firstAt = createdAt;
          if (!info.lastAt || createdAt > info.lastAt) info.lastAt = createdAt;
        }
        variantSales.set(v.id, info);
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
            price
            product{ id title vendor status featuredImage{ url } }
            inventoryItem{
              id
              inventoryLevels(first: 100){
                nodes{
                  quantities(names: ["available", "incoming"]) { name quantity }
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
      const productStatus = String(n?.product?.status || "");
      // Exclude variants whose product is Draft or Archived
      if (productStatus === "DRAFT" || productStatus === "ARCHIVED") continue;
      const info = variantSales.get(n.id);
      const soldQty = Number(info?.qty || 0);
      const levels: any[] = n?.inventoryItem?.inventoryLevels?.nodes ?? [];
      const onHand = levels.reduce((acc, lvl) => {
        const qs: any[] = lvl?.quantities ?? [];
        const avail = qs.find((q) => q?.name === "available")?.quantity ?? 0;
        return acc + Number(avail || 0);
      }, 0);
      const incoming = levels.reduce((acc, lvl) => {
        const qs: any[] = lvl?.quantities ?? [];
        const inc = qs.find((q) => q?.name === "incoming")?.quantity ?? 0;
        return acc + Number(inc || 0);
      }, 0);
      // Heuristic in-stock-only velocity
      let velocity: number;
      let daysOfCover: number;
      if (soldQty <= 0) {
        velocity = 0;
        daysOfCover = Infinity;
      } else {
        // In-stock period heuristic within the window
        const firstAtStr = info?.firstAt;
        const lastAtStr = info?.lastAt;
        const firstAt = firstAtStr ? new Date(firstAtStr) : null;
        const lastAt = lastAtStr ? new Date(lastAtStr) : null;
        // Start: treat first sale as the day it became in stock (bounded by window start)
        const start = firstAt && firstAt > sinceDate ? firstAt : sinceDate;
        // End: if on-hand is zero, treat last sale as the day it went out of stock; else "now"
        const now = new Date();
        const end = onHand === 0 && lastAt ? lastAt : now;
        const ms = Math.max(0, end.getTime() - start.getTime());
        // Impose a minimum in-stock period of 30 days to avoid inflating velocity on very short spans
        const inStockDays = Math.max(30, ms / (24 * 60 * 60 * 1000));
        velocity = soldQty / inStockDays;
        // Days of cover based solely on current on-hand inventory (never negative)
        daysOfCover = onHand / velocity;
      }
      const reorderPoint = velocity * leadTimeDays;
      const targetStock = velocity * targetCoverDays;
      const suggestedOrderQty = Math.max(0, Math.ceil(targetStock - onHand - incoming));

      // Estimated LOST revenue over next 30 days, accounting for current supply
      const horizonDays = 30;
      let estLostRevenue30d = 0;
      if (velocity > 0) {
        const priceAmount = n?.price != null ? Number(n.price) : 0;
        const potentialUnits = velocity * horizonDays;
        const includeIncoming = leadTimeDays < horizonDays;
        const usableSupply = onHand + (includeIncoming ? incoming : 0);
        const lostUnits = Math.max(0, potentialUnits - usableSupply);
        estLostRevenue30d = lostUnits * (isFinite(priceAmount) ? priceAmount : 0);
      }

      // Only include items that need ordering and have some sales velocity
      if (velocity > 0 && onHand + incoming < reorderPoint) {
        rows.push({
          id: n.id,
          sku: n.sku ?? null,
          title: String(n.title || "Variant"),
          productId: n?.product?.id ?? null,
          productTitle: String(n?.product?.title || "Product"),
          productImage: n?.product?.featuredImage?.url ?? null,
          vendor: n?.product?.vendor ?? null,
          priceAmount: n?.price != null ? Number(n.price) : null,
          currencyCode: shopCurrency,
          soldWindowDays: windowDays,
          soldQty,
          velocityPerDay: velocity,
          onHand,
          incoming,
          daysOfCover,
          reorderPoint,
          suggestedOrderQty,
          estLostRevenue30d,
        });
      }
    }
  }

  // Sort by highest estimated lost revenue (30d), then highest velocity, then lowest days of cover
  rows.sort((a, b) => {
    const lr = (b.estLostRevenue30d || 0) - (a.estLostRevenue30d || 0);
    if (lr !== 0) return lr;
    const vel = b.velocityPerDay - a.velocityPerDay;
    if (vel !== 0) return vel;
    const aDoc = isFinite(a.daysOfCover) ? a.daysOfCover : 1e9;
    const bDoc = isFinite(b.daysOfCover) ? b.daysOfCover : 1e9;
    return aDoc - bDoc;
  });

  return {
    items: rows,
    windowDays,
    leadTimeDays,
    targetCoverDays,
    generatedAt: new Date().toISOString(),
    q,
    shop,
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
        "\n\nFix: The 'names' argument expects a list of strings using lower-case enum values." +
        "\nThis route now uses quantities(names: [\"available\", \"incoming\"])." +
        "\nRedeploy and hard refresh to ensure the latest build is active.";
    }
    if (typeof message === "string" && message.includes("Selections can't be made on scalars (field 'price'")) {
      message +=
        "\n\nFix: ProductVariant.price is a scalar in this API version. The code now queries it as a scalar and uses the shop currency for formatting.";
    }
    return {
      items: [] as ReorderRow[],
      windowDays: Number(new URL(request.url).searchParams.get("windowDays")) || DEFAULT_WINDOW_DAYS,
      leadTimeDays: Number(new URL(request.url).searchParams.get("leadTimeDays")) || DEFAULT_LEAD_TIME_DAYS,
      targetCoverDays: Number(new URL(request.url).searchParams.get("targetCoverDays")) || DEFAULT_TARGET_COVER_DAYS,
      generatedAt: new Date().toISOString(),
      q: (new URL(request.url).searchParams.get("q") || "").trim(),
      shop: null,
      error: {
        message,
        stack: err?.stack,
      },
    };
  }
}

export default function InventoryOrdersList() {
  const { items, windowDays, leadTimeDays, targetCoverDays, q, shop, error } = useLoaderData() as {
    items: ReorderRow[];
    windowDays: number;
    leadTimeDays: number;
    targetCoverDays: number;
    generatedAt: string;
    q?: string;
    shop?: string | null;
    error?: { message: string; stack?: string };
  };

  const location = useLocation();
  const navigate = useNavigate();
  const nav = useNavigation();

  const [searchInput, setSearchInput] = useState(q ?? "");
  const lastPushedQ = useRef<string | null>(q ?? null);
  useEffect(() => {
    const now = q ?? "";
    if (lastPushedQ.current !== now && nav.state === "idle") setSearchInput(now);
  }, [q, nav.state]);

  const [windowDaysInput, setWindowDaysInput] = useState(String(windowDays ?? ""));
  const [leadTimeDaysInput, setLeadTimeDaysInput] = useState(String(leadTimeDays ?? ""));
  const [targetCoverDaysInput, setTargetCoverDaysInput] = useState(String(targetCoverDays ?? ""));
  useEffect(() => {
    if (nav.state !== "idle") return;
    setWindowDaysInput(String(windowDays ?? ""));
    setLeadTimeDaysInput(String(leadTimeDays ?? ""));
    setTargetCoverDaysInput(String(targetCoverDays ?? ""));
  }, [windowDays, leadTimeDays, targetCoverDays, nav.state]);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(location.search);

      const nextQ = (searchInput || "").trim();
      if (nextQ) params.set("q", nextQ);
      else params.delete("q");

      // Keep user-entered values in the URL; loader will clamp.
      const wd = Number(windowDaysInput);
      const ld = Number(leadTimeDaysInput);
      const td = Number(targetCoverDaysInput);
      if (!Number.isNaN(wd) && wd > 0) params.set("windowDays", String(wd));
      if (!Number.isNaN(ld) && ld >= 0) params.set("leadTimeDays", String(ld));
      if (!Number.isNaN(td) && td >= 0) params.set("targetCoverDays", String(td));

      const nextSearch = `?${params.toString()}`;
      if (nextSearch !== location.search) {
        lastPushedQ.current = nextQ;
        startTransition(() => {
          navigate({ pathname: location.pathname, search: nextSearch }, { replace: true, preventScrollReset: true });
        });
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, windowDaysInput, leadTimeDaysInput, targetCoverDaysInput]);

  const tokens = (q || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filteredItems = tokens.length
    ? items.filter((it) => {
        const haystack = [it.productTitle, it.title, it.sku, it.vendor]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
    : items;

  function formatCurrency(amount: number, currencyCode?: string | null) {
    const code = currencyCode || "USD";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount || 0);
    } catch {
      // Fallback if the currency code is unexpected
      return `${code} ${Number(amount || 0).toFixed(2)}`;
    }
  }

  return (
    <Page title="Inventory Reorder Priorities" fullWidth>
      {error && (
        <Card>
          <Text as="p" variant="bodyMd" fontWeight="semibold">Loader Error</Text>
          <Text as="p" tone="critical">{error.message}</Text>
          {error.stack && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{error.stack}</pre>}
        </Card>
      )}
      <Card>
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <TextField
              label="Search"
              labelHidden
              value={searchInput}
              onChange={setSearchInput}
              autoComplete="off"
              placeholder="Search product, variant, SKU, vendor…"
            />
            <Text as="span" variant="bodySm" tone="subdued">
              {nav.state !== "idle" ? "Loading…" : `${filteredItems.length} results${q ? ` for “${q}”` : ""}`}
            </Text>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 140 }}>
              <TextField
                label="Window (days)"
                value={windowDaysInput}
                onChange={setWindowDaysInput}
                autoComplete="off"
                type="number"
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <TextField
                label="Lead (days)"
                value={leadTimeDaysInput}
                onChange={setLeadTimeDaysInput}
                autoComplete="off"
                type="number"
              />
            </div>
            <div style={{ minWidth: 170 }}>
              <TextField
                label="Target cover (days)"
                value={targetCoverDaysInput}
                onChange={setTargetCoverDaysInput}
                autoComplete="off"
                type="number"
              />
            </div>
          </div>
        </div>
        <div style={{ width: "100%", overflowX: "auto" }}>
        <IndexTable
          resourceName={{ singular: "variant", plural: "variants" }}
          itemCount={filteredItems.length}
          selectable={false}
          headings={[
            { title: "Product" },
            { title: "Vendor" },
            { title: "SKU" },
            { title: `Sold (${windowDays}d)` },
            { title: "Velocity/d" },
            { title: "On hand" },
            { title: "Incoming" },
            { title: "Days cover" },
            { title: "Est lost rev (30d)" },
            { title: "Reorder pt" },
            { title: "Suggest qty" },
          ]}
        >
          {filteredItems.map((it, idx) => {
            const productNumericId = it.productId ? toNumericId(it.productId) : undefined;
            const productAdminUrl = shop && productNumericId ? `https://${shop}/admin/products/${productNumericId}` : undefined;
            const sku = it.sku ?? null;
            const skuPrefix = sku ? sku.slice(0, 7) : "";
            const skuRemainder = sku ? sku.slice(7) : "";
            const secondary = it.title && it.title !== "Default Title" ? it.title : null;
            return (
            <IndexTable.Row id={it.id} key={it.id} position={idx}>
              <IndexTable.Cell>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Thumbnail source={it.productImage || PLACEHOLDER_IMG} alt={it.productTitle} size="small" />
                  <div>
                    {productAdminUrl ? (
                      <a
                        href={productAdminUrl}
                        target="_top"
                        rel="noreferrer"
                        style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                          e.currentTarget.style.textUnderlineOffset = "2px";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                      >
                        <Text as="span" variant="bodyMd" fontWeight="medium">{it.productTitle}</Text>
                      </a>
                    ) : (
                      <Text as="span" variant="bodyMd" fontWeight="medium">{it.productTitle}</Text>
                    )}
                    {secondary ? (
                      <Text as="span" variant="bodySm" tone="subdued">{" "}- {secondary}</Text>
                    ) : null}
                  </div>
                </div>
              </IndexTable.Cell>
              <IndexTable.Cell>{it.vendor || "—"}</IndexTable.Cell>
              <IndexTable.Cell>
                {sku ? (
                  <Text as="span" variant="bodyMd">
                    <span style={{ fontWeight: 600 }}>{skuPrefix}</span>
                    {skuRemainder}
                  </Text>
                ) : (
                  <Text as="span" variant="bodyMd">—</Text>
                )}
              </IndexTable.Cell>
              <IndexTable.Cell>{it.soldQty}</IndexTable.Cell>
              <IndexTable.Cell>{it.velocityPerDay.toFixed(2)}</IndexTable.Cell>
              <IndexTable.Cell>{it.onHand}</IndexTable.Cell>
              <IndexTable.Cell>{it.incoming}</IndexTable.Cell>
              <IndexTable.Cell>
                {Number.isFinite(it.daysOfCover) ? it.daysOfCover.toFixed(1) : "∞"}
              </IndexTable.Cell>
              <IndexTable.Cell>{formatCurrency(it.estLostRevenue30d, it.currencyCode)}</IndexTable.Cell>
              <IndexTable.Cell>{Math.ceil(it.reorderPoint)}</IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="bold">{it.suggestedOrderQty}</Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          );
          })}
        </IndexTable>
        </div>
      </Card>
    </Page>
  );
}
