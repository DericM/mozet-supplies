/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.print.ts
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
// layout/types used by the Document component
import { renderToString } from "react-dom/server";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import createEmotionServer from "@emotion/server/create-instance";
import { LabelFields } from "../lib/print/components";
import { LAYOUT_S7698_1x3_18UP } from "app/lib/print/layouts";
import { PrintLabelGridDocument } from "app/lib/print/components/Document";



function toNumericId(gid: string): string {
  // gid://shopify/Product/8474977763649 -> 8474977763649
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
}

function storeFromShopParam(shopParam: string | null): string {
  // e.g. "mozetsupplies-test.myshopify.com" -> "mozetsupplies-test"
  if (!shopParam) return "your-store"; // fallback if missing
  return shopParam.split(".")[0];
}

function formatMoneyScalar(price: any, code: string): string {
  const n = price != null ? Number(price) : NaN;
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

function renderHtml18Up(items: LabelFields[]): string {
  const cache = createCache({ key: "css" });
  const { extractCriticalToChunks, constructStyleTagsFromChunks } = createEmotionServer(cache);
  const app = (
    <CacheProvider value={cache}>
      <PrintLabelGridDocument items={items as unknown as LabelFields[]} layout={LAYOUT_S7698_1x3_18UP} />
    </CacheProvider>
  );
  const htmlStr = renderToString(app);
  const chunks = extractCriticalToChunks(htmlStr);
  const styles = constructStyleTagsFromChunks(chunks);
  return `<!doctype html>${htmlStr.replace("</head>", `${styles}</head>`)}`;
}

function mapVariants(variants: any[], store: string, currencyCode: string): LabelFields[] {
  const dateStr = new Date().toISOString().slice(0, 10);
  return variants.map((v: any) => {
    const p = v.product || {};
    const productIdNum = toNumericId(p.id || "");
    const title = `${p.title || ""}${v.title && v.title !== "Default Title" ? ` - ${v.title}` : ""}`.trim();
    const adminUrl = `https://admin.shopify.com/store/${store}/products/${productIdNum}`;
    return {
      title,
      sku: v.sku || "—",
      vendor: p.vendor || "—",
      priceStr: formatMoneyScalar(v.price, currencyCode),
      adminUrl,
      qrDataUrl: undefined,
      dateStr,
    };
  });
}


// GET: render printable HTML if ?ids=... is present
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const idsCsv = (url.searchParams.get("ids") || "").trim();
  if (!idsCsv) {
    return new Response('Missing "ids" query param', { status: 400 });
  }
  const ids = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return new Response("No variant ids provided", { status: 400 });
  }

  const shopParam = url.searchParams.get("shop"); // preserve from embedded params
  const store = storeFromShopParam(shopParam);
  //const format = (url.searchParams.get("format") || "").toLowerCase();

  const resp = await admin.graphql(
    `#graphql
    query VariantsById($ids:[ID!]!) {
      shop { currencyCode }                     # ← get shop currency
      nodes(ids:$ids) {
        ... on ProductVariant {
          id
          sku
          title
          price                                 # ← scalar Money
          product { id title vendor productType status }
        }
      }
    }`,
    { variables: { ids } }
  );
  const json = await resp.json();
  const currencyCode = json?.data?.shop?.currencyCode || "USD";
  const variants = (json?.data?.nodes || [])
    .filter(Boolean)
    .filter((v: any) => (v.product?.status ?? "").toUpperCase() === "ACTIVE");
  const items = mapVariants(variants, store, currencyCode);
  const html = renderHtml18Up(items);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

// POST: redirect to GET (kept for completeness; optional if you're using Button.url)
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const idsCsv = String(form.get("ids") || "").trim();
  if (!idsCsv) return new Response("No variant ids provided", { status: 400 });

  const url = new URL(request.url);
  const search = new URLSearchParams(url.search);
  search.set("ids", idsCsv);
  return redirect(`/app/labels/print?${search.toString()}`);
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
