/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.print.ts
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

const QR_BASE = "https://quickchart.io/qr";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[m]
  );
}

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

function renderHtml(variants: any[], store: string, currencyCode: string) {
  const rows = variants
    .map((v: any) => {
      const p = v.product || {};
      const productIdNum = toNumericId(p.id || "");
      const title = `${p.title || ""}${
        v.title && v.title !== "Default Title" ? ` - ${v.title}` : ""
      }`.trim();
      const sku = v.sku || "—";
      const vendor = p.vendor || "—";
      const priceStr = formatMoneyScalar(v.price, currencyCode);

      const adminUrl = `https://admin.shopify.com/store/${store}/products/${productIdNum}`;
      const qrUrl = `${QR_BASE}?text=${encodeURIComponent(adminUrl)}&size=200&margin=0`;

      return `
      <div class="label">
        <div class="left">
          <div class="top">
            <p class="sku">${escapeHtml(sku)}</p>
          </div>
          <div class="middle">
            <p class="title">${escapeHtml(title)}</p>
          </div>
          <div class="bottom meta">
            <span class="vendor">${escapeHtml(vendor)}</span>
            <span class="price">${escapeHtml(priceStr)}</span>
          </div>
        </div>
        <div class="right">
          <img src="${qrUrl}" alt="QR">
        </div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
    <html>
    <head>
    <meta charset="utf-8"/>
    <title>Labels</title>
    <style>
      @page { size: 3in 1in; margin: 0; }
      body { margin: 0; padding: 0; display: flex; flex-wrap: wrap; background: #fff; font-family: Arial, sans-serif; }

      .label {
        box-sizing: border-box; width: 3in; height: 1in;
        display: flex; justify-content: space-between; align-items: stretch;
        border: 0.75pt solid #999; border-radius: 0.15in; padding: 0.05in 0.05in;
        page-break-after: always;
      }

      .left {
        width: 72%;
        display: flex; flex-direction: column;
        justify-content: space-between; /* top, middle, bottom fixed */
        height: 100%;
        text-align: left;
      }

      .top { flex: 0 0 auto; }
      .middle { flex: 1 1 auto; display: flex; align-items: center; }

      .bottom.meta {
        flex: 0 0 auto;
        display: flex; justify-content: space-between; align-items: baseline; gap: 6px;
      }

      /* SKU: same size, less vertical space */
      .sku {
        font-size: 18pt; font-weight: bold;
        margin: 0;               /* remove default margins */
        line-height: 1.0;        /* tighter line height */
        letter-spacing: 0.2pt;   /* optional: slight tracking for readability */
      }

      /* Title: allow up to 3 lines, left-aligned */
      .title {
        font-size: 10pt; margin: 0; line-height: 1.05;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        overflow: hidden;
        text-align: left;
      }

      /* Bottom row: vendor left (ellipsis), price right (bold) */
      .vendor{
        font-size: 8pt; line-height: 1.05;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%;
      }
      .price {
        font-size: 9pt; line-height: 1.05; font-weight: bold; white-space: nowrap;
      }

      /* QR: 25% smaller and centered */
      .right { width: 28%; display: flex; align-items: center; justify-content: center; text-align: center; }
      img { width: 0.675in; height: 0.675in; }  /* 0.9in → 0.675in */

      @media print { .controls { display: none; } }
    </style>
    </head>
    <body>
      ${rows}
    </body>
    </html>`;
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
          product { id title vendor productType }
        }
      }
    }`,
    { variables: { ids } }
  );
  const json = await resp.json();
  const currencyCode = json?.data?.shop?.currencyCode || "USD";
  const variants = (json?.data?.nodes || []).filter(Boolean);
  const html = renderHtml(variants, store, currencyCode);

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
