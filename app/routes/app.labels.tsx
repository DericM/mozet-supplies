/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.tsx  (component section only)
import { startTransition, useEffect, useRef, useState } from "react";
// (merged into the main react-router import below)
import { createApp } from "@shopify/app-bridge";
import { useFetcher, useLoaderData, useLocation, useNavigate, useNavigation, useRevalidator, useMatches } from "react-router";
import { Page, Card, Button, IndexTable, useIndexResourceState, TextField, Text, Thumbnail } from "@shopify/polaris";

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildVariantQueryString, toNumericId } from "../lib/search";

const PLACEHOLDER_IMG =
  "https://cdn.shopify.com/s/images/admin/no-image-compact-illustration.svg";

type VariantRow = {
  id: string;
  sku: string | null;
  variantTitle: string | null;
  productId: string;
  productTitle: string;
  productType: string | null;
  vendor: string | null;
  productImage: string | null;
};

// toNumericId moved into app/lib/search

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();
  const addProductId = url.searchParams.get("addProductId")
    || url.searchParams.get("resourceId")
    || url.searchParams.get("resource_id")
    || url.searchParams.get("productId")
    || url.searchParams.get("product_id")
    || url.searchParams.get("id");
  const addVariantIdsParam = url.searchParams.get("addVariantIds");
  // Additional arrays often appended by Admin links from index/selection actions
  const idsArray = url.searchParams.getAll("ids[]");
  const resourceIdsArray = url.searchParams.getAll("resourceIds[]");
  const productIdsArray = url.searchParams.getAll("productIds[]");
  const selectedArray = url.searchParams.getAll("selected[]");
  const resourceGid = url.searchParams.get("resourceGid") || url.searchParams.get("resource_gid");
  const includeZero = (url.searchParams.get("includeZero") || "0") === "1"; // default exclude
  const includeDraft = (url.searchParams.get("includeDraft") || "0") === "1"; // default exclude
  const includeArchived = (url.searchParams.get("includeArchived") || "0") === "1"; // default exclude
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const pageSize = 50; // change to 250 if you like

  // Build final variant query string (multi-word AND with vendor/type narrowing)
  const query = await buildVariantQueryString(admin, q, { includeDraft, includeArchived, includeZero });

  // Use first/after for forward, last/before for backward
  const variables: any = { query };
  if (before) {
    variables.before = before;
    variables.last = pageSize;
  } else {
    variables.after = after ?? null;
    variables.first = pageSize;
  }

  const resp = await admin.graphql(
    `#graphql
    query VariantsPage($first:Int,$after:String,$last:Int,$before:String,$query:String){
      productVariants(first:$first, after:$after, last:$last, before:$before, query:$query){
        edges{
          cursor
          node{
            id
            sku
            title
            inventoryQuantity
            product{
              id
              title
              productType
              vendor
              status
              featuredImage{ url }
            }
          }
        }
        pageInfo{
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`,
    { variables }
  );

  const json = await resp.json();
  const connection = json?.data?.productVariants;
  const edges = connection?.edges ?? [];
  const pageInfo = connection?.pageInfo ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  };

  const items = edges.map((e: any) => ({
    id: e.node.id,
    sku: e.node.sku,
    variantTitle: e.node.title,
    productId: e.node.product.id,
    productTitle: e.node.product.title,
    productType: e.node.product.productType ?? null,
    vendor: e.node.product.vendor ?? null,
    productImage: e.node.product.featuredImage?.url ?? null,
  }));

  // Optional: build a list of variants to add to queue from any recognized params
  let addQueue: Array<{ id: string; sku: string | null }> = [];
  try {
    const variantIds: Set<string> = new Set();
    const productIds: Set<string> = new Set();

    const toProductGid = (val: string) => (val?.startsWith("gid://") ? val : `gid://shopify/Product/${val}`);
    const toVariantGid = (val: string) => (val?.startsWith("gid://") ? val : `gid://shopify/ProductVariant/${val}`);

    if (addVariantIdsParam) {
      for (const s of addVariantIdsParam.split(",")) {
        const v = s.trim();
        if (v) variantIds.add(v);
      }
    }
    if (addProductId) {
      const v = addProductId.trim();
      if (v) {
        if (v.includes("ProductVariant/")) variantIds.add(v);
        else productIds.add(v);
      }
    }
    if (resourceGid) {
      if (resourceGid.includes("ProductVariant/")) variantIds.add(resourceGid);
      else if (resourceGid.includes("Product/")) productIds.add(resourceGid);
    }
    for (const arr of [idsArray, resourceIdsArray, productIdsArray, selectedArray]) {
      for (const v of arr) {
        const val = v.trim();
        if (!val) continue;
        if (val.includes("ProductVariant/")) variantIds.add(val);
        else productIds.add(val);
      }
    }

    // Normalize numerics to GIDs
    const normProductIds: string[] = Array.from(productIds).map((v) => (/^\d+$/.test(v) ? toProductGid(v) : v));
    const normVariantIds: string[] = Array.from(variantIds).map((v) => (/^\d+$/.test(v) ? toVariantGid(v) : v));

    const allIds = [...normProductIds, ...normVariantIds];
    if (allIds.length > 0) {
      const nodesRes = await admin.graphql(
        `#graphql
        query NodesForQueue($ids: [ID!]!) {
          nodes(ids: $ids) {
            id
            ... on Product { variants(first: 250) { nodes { id sku } } }
            ... on ProductVariant { id sku }
          }
        }
        `,
        { variables: { ids: allIds } }
      );
      const njson = await nodesRes.json();
      const nodes = njson?.data?.nodes ?? [];
      const queue: Array<{ id: string; sku: string | null }> = [];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (n.variants && n.variants.nodes) {
          for (const vn of n.variants.nodes) queue.push({ id: vn.id, sku: vn.sku ?? null });
        } else if (n.id && (n.id as string).includes("ProductVariant/")) {
          queue.push({ id: n.id as string, sku: n.sku ?? null });
        }
      }
      addQueue = queue;
    }
  } catch {
    // ignore addQueue errors
  }

  return { items, pageInfo, q, addQueue };
}


export default function Labels() {
  const { items, pageInfo, q, addQueue } = useLoaderData() as {
    items: VariantRow[];
    pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
    q: string;
    addQueue?: Array<{ id: string; sku: string | null }>;
  };
  // Helper: resolve apiKey from parent /app route loader via matches
  // and persist host from the URL for subsequent navigations.
  const matches = useMatches();
  const parentData: any = Array.isArray(matches) ? matches.find((m: any) => m?.data && typeof m.data === 'object' && 'apiKey' in m.data)?.data : null;
  const apiKeyFromParent: string | undefined = parentData ? (parentData as any).apiKey : undefined;

  const location = useLocation();
  const shopFromQuery = (new URLSearchParams(location.search)).get("shop") || undefined;
  const navigate = useNavigate();
  const nav = useNavigation();
  const addFetcher = useFetcher<{ ok: boolean; updated: number; errors?: string[] }>();
  const revalidator = useRevalidator();

  // --- Print Queue (client-side, persisted in localStorage for this page)
  type PrintQueueItem = { id: string; sku: string | null };
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
  const [queueReadyToPersist, setQueueReadyToPersist] = useState(false);
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("label_print_queue_variant_ids") : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) setPrintQueue([]);
          else if (typeof parsed[0] === "string") {
            setPrintQueue(parsed.filter((x: any) => typeof x === "string").map((id: string) => ({ id, sku: null })));
          } else {
            setPrintQueue(
              parsed
                .filter((x: any) => x && typeof x.id === "string")
                .map((x: any) => ({ id: String(x.id), sku: x.sku ?? null }))
            );
          }
        }
      }
      setQueueReadyToPersist(true);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      if (!queueReadyToPersist) return;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("label_print_queue_variant_ids", JSON.stringify(printQueue));
      }
    } catch {
      // ignore
    }
  }, [printQueue, queueReadyToPersist]);

  // --- Search input decoupled from URL
  const [input, setInput] = useState(q ?? "");
  const lastPushedQ = useRef<string | null>(q ?? null);
  useEffect(() => {
    const now = q ?? "";
    if (lastPushedQ.current !== now && nav.state === "idle") setInput(now);
  }, [q, nav.state]);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      if (input) params.set("q", input); else params.delete("q");
      // Persist zero-inventory preference from localStorage
      try {
        const pref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_zero_inventory") : null;
        const includeZero = pref === "1" ? "1" : "0"; // default exclude
        params.set("includeZero", includeZero);
        const draftPref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_draft") : null;
        const includeDraft = draftPref === "1" ? "1" : "0";
        params.set("includeDraft", includeDraft);
        const archivedPref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_archived") : null;
        const includeArchived = archivedPref === "1" ? "1" : "0";
        params.set("includeArchived", includeArchived);
      } catch {
        // ignore
      }
      // when changing query, reset cursors
      params.delete("after");
      params.delete("before");
      const nextSearch = `?${params.toString()}`;
      if (nextSearch !== location.search) {
        lastPushedQ.current = input;
        startTransition(() => {
          navigate({ pathname: location.pathname, search: nextSearch }, { replace: true, preventScrollReset: true });
        });
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Merge server-provided addQueue (from admin-link params) into client queue on each navigation that includes those params, then clean URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const triggerKeys = [
      "addProductId","addVariantIds","resourceId","resource_id","productId","product_id","id",
      "ids[]","resourceIds[]","productIds[]","selected[]","resourceGid","resource_gid"
    ];
    const hasTrigger = triggerKeys.some((k) => (k.endsWith("[]") ? params.getAll(k).length > 0 : params.has(k)));
    if (!hasTrigger) return;
    if (addQueue && addQueue.length > 0) {
      setPrintQueue((prev) => {
        const map = new Map(prev.map((p) => [p.id, p] as const));
        for (const e of addQueue) map.set(e.id, { id: e.id, sku: e.sku ?? null });
        return Array.from(map.values());
      });
    }
    // Clean URL to avoid re-triggering on next renders
    let changed = false;
    for (const k of triggerKeys) {
      if ((k.endsWith("[]") ? params.getAll(k).length > 0 : params.has(k))) {
        params.delete(k);
        changed = true;
      }
    }
    if (changed) {
      const cleaned = `?${params.toString()}`;
      startTransition(() => {
        navigate({ pathname: location.pathname, search: cleaned }, { replace: true, preventScrollReset: true });
      });
    }
  }, [addQueue, location.search, location.pathname, navigate]);

  // --- Table rows come straight from loader (no append)
  const rows = items ?? [];

  // Selection held in parent; actual table selection lives in child and syncs up
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tableMountKey, setTableMountKey] = useState(0);
  const hasSelection = selectedIds.length > 0;


  // Which selected rows are missing SKUs?
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const productIdsNeedingSkus = Array.from(
    new Set(
      selectedRows
        .filter((r) => !r.sku || r.sku.trim() === "")
        .map((r) => r.productId)
    )
  );
  const selectedProductIds = Array.from(new Set(selectedRows.map((r) => r.productId)));

  const [overwrite, setOverwrite] = useState(false);
  // Read overwrite preference from Settings (localStorage); default false
  useEffect(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem("sku_overwrite") : null;
      setOverwrite(v === "1");
    } catch {
      // ignore
    }
  }, []);
  const canAddSkus = (overwrite ? selectedProductIds.length > 0 : productIdsNeedingSkus.length > 0) && addFetcher.state === "idle";
  const selectedCount = selectedIds.length;
  const missingRowsCount = selectedRows.filter((r) => !r.sku || r.sku.trim() === "").length;
  const displayCount = overwrite ? selectedCount : missingRowsCount;

  // Direct print: fetch printable HTML with a session token, inject into a hidden iframe, and call print()
  async function onPrint(ids: string[], opts?: { afterPrint?: () => void }) {
    if (!ids || ids.length === 0) return;
    try {
      // Build a relative URL to the printable route with selected ids
      const params = new URLSearchParams(location.search);
      params.set("ids", ids.join(","));
      // Pick layout from localStorage (saved in Settings); default to S-7698
      const savedLayout = (typeof window !== "undefined" ? window.localStorage.getItem("print_layout") : null) || "s7698";
      params.set("format", savedLayout);
      if (!params.get("embedded")) params.set("embedded", "1");
      const path = `/app/labels/print?${params.toString()}`;

      // Get a fresh session token via App Bridge
      const { getSessionToken } = await import("@shopify/app-bridge/utilities");
      // Determine host from URL or sessionStorage; persist if present
      const usp = new URLSearchParams(location.search);
      const host = usp.get("host") || (typeof window !== "undefined" ? window.sessionStorage.getItem("shopify_host") || undefined : undefined);
      if (usp.get("host")) {
        try { window.sessionStorage.setItem("shopify_host", usp.get("host")!); } catch (e) { /* ignore */ }
      }
      const apiKey = apiKeyFromParent;
      if (!apiKey || !host) throw new Error("Missing apiKey/host for App Bridge");
      const app = createApp({ apiKey, host, forceRedirect: true });
      const token = await (getSessionToken as (app: unknown) => Promise<string>)(app);

      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const html = await res.text();

      // Create an offscreen iframe and write the HTML, then print.
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      let removed = false;
      // Helper at this scope to satisfy linter (no inner function declarations)
      const waitForImages = async (win: Window, timeoutMs = 3000) => {
        try {
          const doc = win.document as Document;
          const imgs = Array.from(doc.images) as HTMLImageElement[];
          const pending = imgs.filter((img) => !(img.complete && img.naturalWidth > 0));
          if (pending.length === 0) return;
          const loadPromises = pending.map(
            (img) =>
              new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              })
          );
          await Promise.race([
            Promise.all(loadPromises),
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
          ]);
        } catch {
          // ignore
        }
      };
      const cleanup = () => {
        if (removed) return;
        removed = true;
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch (e) {
          console.warn("cleanup failed", e);
        }
      };

      const iw = iframe.contentWindow;
      if (!iw) throw new Error("iframe window unavailable");
      iw.document.open();
      iw.document.write(html);
      iw.document.close();

      // Attempt to print when the iframe has loaded content
      const onLoad = async () => {
        try {
          // Wait a moment for images (QRs) to load in Chrome to avoid blank prints
          await waitForImages(iw, 4000);
          iw.focus();
          // Afterprint cleanup
          iw.addEventListener(
            "afterprint",
            () => {
              try {
                if (opts && typeof opts.afterPrint === "function") opts.afterPrint();
              } catch (err) {
                // ignore
              }
              cleanup();
            },
            { once: true } as any
          );
          iw.print();
          // Fallback cleanup in case afterprint doesn’t fire
          setTimeout(cleanup, 5000);
        } catch (e) {
          console.error("print error", e);
          cleanup();
        }
      };
      // If the document is already ready, print immediately; else wait a tick
      if (iw.document.readyState === "complete") {
        onLoad();
      } else {
        iw.addEventListener("load", onLoad, { once: true } as any);
      }
    } catch (e) {
      console.error("direct print failed", e);
    }
  }

  function onUnifiedButtonClick() {
    if (hasSelection) {
      const byId = new Map<string, PrintQueueItem>();
      for (const item of printQueue) byId.set(item.id, item);
      for (const id of selectedIds) {
        const row = rows.find((r) => r.id === id);
        byId.set(id, { id, sku: row?.sku ?? null });
      }
      setPrintQueue(Array.from(byId.values()));
      setSelectedIds([]);
      setTableMountKey((k) => k + 1); // remount table to clear internal selection state
    } else {
      if (printQueue.length > 0)
        onPrint(
          printQueue.map((p) => p.id),
          {
            afterPrint: () => {
              recordPrintHistory(printQueue);
              setPrintQueue([]);
            },
          }
        );
    }
  }

  function recordPrintHistory(entries: PrintQueueItem[]) {
    try {
      const key = "label_print_history";
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const existing: any[] = raw ? (JSON.parse(raw) as any[]) : [];
      const now = new Date().toISOString();
      const record = {
        date: now,
        count: entries.length,
        skus: entries.map((e) => e.sku).filter((s): s is string => !!s),
        ids: entries.map((e) => e.id),
      };
      const next = [record, ...existing].slice(0, 25);
      if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function onAddSkus() {
    if (!canAddSkus) return;
    const params = new URLSearchParams(location.search); // keep ?host=&shop=&embedded
    const ids = overwrite ? selectedProductIds : productIdsNeedingSkus;
    const body: Record<string, string> = { productIds: ids.join(",") };
    if (overwrite) body.force = "1";
    addFetcher.submit(
      body,
      { method: "post", action: `/app/labels/add-skus?${params.toString()}` }
    );
  }

  // After action completes, refresh data ONCE so new SKUs show up
  const prevAddState = useRef(addFetcher.state);
  useEffect(() => {
    const was = prevAddState.current;
    prevAddState.current = addFetcher.state;
    const justFinished = was !== "idle" && addFetcher.state === "idle";
    if (justFinished && addFetcher.data) {
      revalidator.revalidate();
    }
  }, [addFetcher.state, addFetcher.data, revalidator]);


  // --- Pagination helpers (replace results with next/prev page)
  function buildUrlWith(update: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(location.search);
    if (input) p.set("q", input); else p.delete("q");
    try {
      const pref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_zero_inventory") : null;
      const includeZero = pref === "1" ? "1" : "0"; // default exclude
      p.set("includeZero", includeZero);
      const draftPref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_draft") : null;
      const includeDraft = draftPref === "1" ? "1" : "0";
      p.set("includeDraft", includeDraft);
      const archivedPref = typeof window !== "undefined" ? window.localStorage.getItem("search_include_archived") : null;
      const includeArchived = archivedPref === "1" ? "1" : "0";
      p.set("includeArchived", includeArchived);
    } catch {
      // ignore
    }
    update(p);
    const qs = p.toString();
    return `${location.pathname}${qs ? `?${qs}` : ""}`;
  }

  const goNext = () => {
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) return;
    navigate(
      buildUrlWith((p) => {
        p.set("after", pageInfo.endCursor!);
        p.delete("before");
      }),
      { preventScrollReset: true }
    );
  };

  const goPrev = () => {
    if (!pageInfo?.hasPreviousPage || !pageInfo?.startCursor) return;
    navigate(
      buildUrlWith((p) => {
        p.set("before", pageInfo.startCursor!);
        p.delete("after");
      }),
      { preventScrollReset: true }
    );
  };

  return (
    <Page title="Generate & Print Labels" fullWidth>
      <Card>
        {/* Top: search + actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TextField
              label="Search by product/variant title, SKU, vendor, or type"
              labelHidden
              value={input}
              onChange={setInput}
              autoComplete="off"
              placeholder="Search…"
            />
            <Text as="span" variant="bodySm" tone="subdued">
              {nav.state !== "idle" ? "Loading…" : `${rows.length} results${q ? ` for “${q}”` : ""}`}
            </Text>
          </div>
       <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
             {/* Add/Overwrite SKUs */}
             <Button
               onClick={onAddSkus}
               disabled={!canAddSkus}
               tone="success"
             >
               {addFetcher.state !== "idle"
                 ? (overwrite ? `Overwriting ${displayCount}…` : `Adding ${displayCount} SKUs…`)
                 : (overwrite ? `Overwrite ${displayCount} SKUs` : `Add ${displayCount} SKUs`)}
             </Button>

             <Button
               onClick={onUnifiedButtonClick}
               variant={hasSelection ? "secondary" : "primary"}
               disabled={!hasSelection && printQueue.length === 0}
             >
               {hasSelection
                 ? `Add (${selectedIds.length}) to Print Que`
                 : `Print (${printQueue.length}) Labels`}
             </Button>
           </div>
        </div>

        {/* Table */}
        <div style={{ marginTop: 12 }}>
          <LabelsIndexTable
            key={`labels-table-${tableMountKey}`}
            rows={rows}
            onSelectionIdsChange={setSelectedIds}
            shop={shopFromQuery}
          />
        </div>

        {/* Pager arrows */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <Button onClick={goPrev} disabled={!pageInfo?.hasPreviousPage}>
            ← Previous
          </Button>
          <Text as="span" variant="bodySm" tone="subdued">
            {pageInfo?.hasPreviousPage ? "More above • " : ""}
            {pageInfo?.hasNextPage ? "More below" : "End of results"}
          </Text>
          <Button onClick={goNext} disabled={!pageInfo?.hasNextPage}>
            Next →
          </Button>
        </div>

        {/* Bottom-right actions (print button removed to keep a single control) */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button
              onClick={onAddSkus}
              disabled={!canAddSkus}
              tone="success"
            >
              {addFetcher.state !== "idle"
                ? (overwrite ? `Overwriting ${displayCount}…` : `Adding ${displayCount} SKUs…`)
                : (overwrite ? `Overwrite ${displayCount} SKUs` : `Add ${displayCount} SKUs`)}
            </Button>
          </div>
        </div>
      </Card>
    </Page>
  );
}

type LabelsIndexTableProps = {
  rows: VariantRow[];
  onSelectionIdsChange: (ids: string[]) => void;
  shop?: string;
};

function LabelsIndexTable({ rows, onSelectionIdsChange, shop }: LabelsIndexTableProps) {
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(rows);

  useEffect(() => {
    onSelectionIdsChange(selectedResources);
  }, [selectedResources, onSelectionIdsChange]);

  return (
    <IndexTable
      resourceName={{ singular: "variant", plural: "variants" }}
      itemCount={rows.length}
      selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
      onSelectionChange={handleSelectionChange}
      headings={[
        { title: "Product" },
        { title: "Type" },
        { title: "Vendor" },
        { title: "SKU" },
      ]}
    >
      {rows.map((item, index) => {
        const secondary = item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : null;
        const productNumericId = item.productId ? toNumericId(item.productId) : undefined;
        const productAdminUrl = shop && productNumericId ? `https://${shop}/admin/products/${productNumericId}` : undefined;
        const sku = item.sku ?? null;
        const skuPrefix = sku ? sku.slice(0, 7) : "";
        const skuRemainder = sku ? sku.slice(7) : "";
        return (
          <IndexTable.Row id={item.id} key={item.id} position={index} selected={selectedResources.includes(item.id)}>
            <IndexTable.Cell>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Thumbnail source={item.productImage || PLACEHOLDER_IMG} alt={item.productTitle} size="small" />
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
                      <Text as="span" variant="bodyMd" fontWeight="medium">{item.productTitle}</Text>
                    </a>
                  ) : (
                    <Text as="span" variant="bodyMd" fontWeight="medium">{item.productTitle}</Text>
                  )}
                  {secondary ? (
                    <Text as="span" variant="bodySm" tone="subdued">{" "}- {secondary}</Text>
                  ) : null}
                </div>
              </div>
            </IndexTable.Cell>
            <IndexTable.Cell><Text as="span" variant="bodyMd">{item.productType ?? "—"}</Text></IndexTable.Cell>
            <IndexTable.Cell><Text as="span" variant="bodyMd">{item.vendor ?? "—"}</Text></IndexTable.Cell>
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
          </IndexTable.Row>
        );
      })}
    </IndexTable>
  );
}