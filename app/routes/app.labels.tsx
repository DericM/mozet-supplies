/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.tsx  (component section only)
import { startTransition, useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
} from "react-router";
import {
  Page,
  Card,
  Button,
  IndexTable,
  useIndexResourceState,
  TextField,
  Text,
  Thumbnail,
} from "@shopify/polaris";

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

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

function toNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const pageSize = 50; // change to 250 if you like

  // Build variant search (sku/title/product_title) + optional product_ids from vendor/type
  const esc = q.replace(/"/g, '\\"');
  const parts: string[] = [];
  if (q) {
    parts.push(`sku:*${esc}*`);
    parts.push(`title:*${esc}*`);
    parts.push(`product_title:*${esc}*`);
  }
  if (q) {
    const pSearch = [`vendor:*${esc}*`, `product_type:*${esc}*`].join(" OR ");
    const pResp = await admin.graphql(
      `#graphql
      query ProductsForIds($first:Int!,$query:String){
        products(first:$first, query:$query){
          edges{ node{ id } }
        }
      }`,
      { variables: { first: 250, query: pSearch } }
    );
    const pJson = await pResp.json();
    const ids: string[] = (pJson?.data?.products?.edges ?? []).map(
      (e: any) => toNumericId(e.node.id)
    );
    if (ids.length) parts.push(`product_ids:${ids.join(",")}`);
  }
  const query = parts.length ? parts.join(" OR ") : null;

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
            product{
              id
              title
              productType
              vendor
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

  return { items, pageInfo, q };
}


export default function Labels() {
  const { items, pageInfo, q } = useLoaderData() as {
    items: VariantRow[];
    pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
    q: string;
  };

  const location = useLocation();
  const navigate = useNavigate();
  const nav = useNavigation();
  const addFetcher = useFetcher<{ ok: boolean; updated: number; errors?: string[] }>();
  const revalidator = useRevalidator();

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
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // --- Table rows come straight from loader (no append)
  const rows = items ?? [];

  // Selection + actions
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows);
  const hasSelection = selectedResources.length > 0;


  // Which selected rows are missing SKUs?
  const selectedRows = rows.filter((r) => selectedResources.includes(r.id));
  const productIdsNeedingSkus = Array.from(
    new Set(
      selectedRows
        .filter((r) => !r.sku || r.sku.trim() === "")
        .map((r) => r.productId)
    )
  );
  const canAddSkus = productIdsNeedingSkus.length > 0 && addFetcher.state === "idle";

  function onAddSkus() {
    if (!canAddSkus) return;
    const params = new URLSearchParams(location.search); // keep ?host=&shop=&embedded
    addFetcher.submit(
      { productIds: productIdsNeedingSkus.join(",") },
      { method: "post", action: `/app/labels/add-skus?${params.toString()}` }
    );
  }

  // After it runs, refresh data so new SKUs show up
  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data) {
      revalidator.revalidate();
    }
  }, [addFetcher.state, addFetcher.data, revalidator]);


  // --- Pagination helpers (replace results with next/prev page)
  function buildUrlWith(update: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(location.search);
    if (input) p.set("q", input); else p.delete("q");
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

  
  // app/routes/app.labels.tsx
  function buildPrintRelayHrefAbs() {
    if (!selectedResources.length) return undefined;

    const params = new URLSearchParams(location.search);
    params.set("ids", selectedResources.join(","));
    if (!params.get("embedded")) params.set("embedded", "1");
    if (!params.get("host")) {
      const savedHost = window.sessionStorage.getItem("shopify_host");
      if (savedHost) params.set("host", savedHost);
    }

    const origin = (window as any).__APP_ORIGIN__ || window.location.origin; // ← prefer server-provided origin
    return new URL(`/app/labels/print-remote?${params.toString()}`, origin).toString();
  }


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
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              onClick={() => setInput("")}
              disabled={!input}
            >
              Clear
            </Button>

            {/* Add SKUs (enabled only if selected rows have missing SKUs) */}
            <Button
              onClick={onAddSkus}
              disabled={!canAddSkus}
              tone="success"
            >
              {addFetcher.state !== "idle" ? "Adding SKUs…" : `Add SKUs${productIdsNeedingSkus.length ? ` (${productIdsNeedingSkus.length})` : ""}`}
            </Button>

            {/* Print stays the same */}
            <Button url={buildPrintRelayHrefAbs()} external variant="primary" disabled={!hasSelection}>
              Print {hasSelection ? `(${selectedResources.length})` : ""}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div style={{ marginTop: 12 }}>
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
              const secondary =
                item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : null;
              return (
                <IndexTable.Row
                  id={item.id}
                  key={item.id}
                  position={index}
                  selected={selectedResources.includes(item.id)}
                >
                  <IndexTable.Cell>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Thumbnail source={item.productImage || PLACEHOLDER_IMG} alt={item.productTitle} size="small" />
                      <div>
                        <Text as="span" variant="bodyMd" fontWeight="medium">{item.productTitle}</Text>
                        {secondary ? (
                          <Text as="span" variant="bodySm" tone="subdued">{" "}- {secondary}</Text>
                        ) : null}
                      </div>
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell><Text as="span" variant="bodyMd">{item.productType ?? "—"}</Text></IndexTable.Cell>
                  <IndexTable.Cell><Text as="span" variant="bodyMd">{item.vendor ?? "—"}</Text></IndexTable.Cell>
                  <IndexTable.Cell><Text as="span" variant="bodyMd">{item.sku ?? "—"}</Text></IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>
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

        {/* Bottom-right actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              onClick={() => setInput("")}
              disabled={!input}
            >
              Clear
            </Button>

            {/* Add SKUs (enabled only if selected rows have missing SKUs) */}
            <Button
              onClick={onAddSkus}
              disabled={!canAddSkus}
              tone="success"
            >
              {addFetcher.state !== "idle" ? "Adding SKUs…" : `Add SKUs${productIdsNeedingSkus.length ? ` (${productIdsNeedingSkus.length})` : ""}`}
            </Button>

            <Button url={buildPrintRelayHrefAbs()} external variant="primary" disabled={!hasSelection}>
              Print {hasSelection ? `(${selectedResources.length})` : ""}
            </Button>
          </div>
        </div>
      </Card>
    </Page>
  );
}