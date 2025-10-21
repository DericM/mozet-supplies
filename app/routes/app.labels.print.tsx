/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.print.ts
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { LAYOUT_18UP_LETTER_DEFAULT, LAYOUT_S7698_1x3_18UP, cssInches, type PageLayout } from "../lib/print/layouts";
import QRCode from "qrcode";

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

function renderHtmlSingleLabelPerPage(variants: any[], store: string, currencyCode: string) {
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

type PresentVariant = {
  title: string;
  sku: string;
  vendor: string;
  priceStr: string;
  adminUrl: string;
  qrDataUrl?: string; // used for 18-up
};

function mapVariants(variants: any[], store: string, currencyCode: string): PresentVariant[] {
  return variants.map((v: any) => {
    const p = v.product || {};
    const productIdNum = toNumericId(p.id || "");
    const title = `${p.title || ""}${
      v.title && v.title !== "Default Title" ? ` - ${v.title}` : ""
    }`.trim();
    const sku = v.sku || "—";
    const vendor = p.vendor || "—";
    const priceStr = formatMoneyScalar(v.price, currencyCode);
    const adminUrl = `https://admin.shopify.com/store/${store}/products/${productIdNum}`;
    return { title, sku, vendor, priceStr, adminUrl };
  });
}

async function attachQrDataUrls(items: PresentVariant[], qrPixels = 240): Promise<PresentVariant[]> {
  // Generate crisp QR PNG data URLs for each adminUrl
  const out: PresentVariant[] = [];
  for (const it of items) {
    try {
      const dataUrl = await QRCode.toDataURL(it.adminUrl, {
        errorCorrectionLevel: "M",
        margin: 0,
        width: qrPixels,
        scale: 8,
      });
      out.push({ ...it, qrDataUrl: dataUrl });
    } catch {
      out.push({ ...it });
    }
  }
  return out;
}

function renderHtml18Up(
  items: PresentVariant[],
  layout: PageLayout,
  opts?: {
    startOffset?: number;
    debug?: boolean;
    bgUrl?: string | null;
    bgOpacity?: number; // 0..1
    bgSizePct?: number; // e.g. 100 for full-page
    bgOffsetXIn?: number; // background-position X offset in inches
    bgOffsetYIn?: number; // background-position Y offset in inches
  }
) {
  const startOffset = Math.max(0, opts?.startOffset ?? 0);
  const debug = !!opts?.debug;
  const bgUrl = opts?.bgUrl || null;
  const bgOpacity = Math.max(0, Math.min(1, opts?.bgOpacity ?? 0.25));
  const bgSizePct = isFinite(opts?.bgSizePct ?? NaN) ? (opts!.bgSizePct as number) : 100;
  const bgOffsetXIn = opts?.bgOffsetXIn ?? 0;
  const bgOffsetYIn = opts?.bgOffsetYIn ?? 0;
  const cols = layout.grid.columns;
  const rows = layout.grid.rows;
  const perPage = cols * rows;

  // Calculate CSS sizes
  const {
    widthIn,
    heightIn,
    marginTopIn,
    marginRightIn,
    marginBottomIn,
    marginLeftIn,
  } = layout.page;
  const { hGapIn, vGapIn, labelWidthIn, labelHeightIn } = layout.grid;

  // Split into pages considering startOffset
  const totalCells = startOffset + items.length;
  const pageCount = Math.max(1, Math.ceil(totalCells / perPage));

  const pagesHtml: string[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const cellStart = pageIndex * perPage;
    const cellEnd = cellStart + perPage;

    const cellsHtml: string[] = [];
    for (let cell = cellStart; cell < cellEnd; cell++) {
      const globalIndex = cell;
      const itemIndex = globalIndex - startOffset;
      const item = itemIndex >= 0 && itemIndex < items.length ? items[itemIndex] : null;
      // Content for each label cell
      if (item) {
            // Match previous QR sizing: ~0.675in square
            const qrSizeIn = 0.675;
        const qrStyle = `width:${cssInches(qrSizeIn)};height:${cssInches(qrSizeIn)};`;
        const border = debug ? 'border: 0.5pt dashed #f00;' : '';
        cellsHtml.push(`
          <div class="cell" style="${border}">
            <div class="label">
              <div class="left">
                <div class="top"><p class="sku">${escapeHtml(item.sku)}</p></div>
                <div class="middle"><p class="title">${escapeHtml(item.title)}</p></div>
                <div class="bottom meta">
                  <span class="vendor">${escapeHtml(item.vendor)}</span>
                  <span class="price">${escapeHtml(item.priceStr)}</span>
                </div>
              </div>
              <div class="right">
                ${item.qrDataUrl ? `<img src="${item.qrDataUrl}" alt="QR" style="${qrStyle}"/>` : ""}
              </div>
            </div>
          </div>`);
      } else {
        const border = debug ? 'border: 0.5pt dashed #99c;' : '';
        cellsHtml.push(`<div class="cell" style="${border}"></div>`);
      }
    }

    pagesHtml.push(`
      <section class="page">
        <div class="grid">
          ${cellsHtml.join("\n")}
        </div>
      </section>
    `);
  }

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Labels</title>
    <style>
      @page { size: ${cssInches(widthIn)} ${cssInches(heightIn)}; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; }
      .page {
        box-sizing: border-box;
        width: ${cssInches(widthIn)};
        height: ${cssInches(heightIn)};
        padding: ${cssInches(marginTopIn)} ${cssInches(marginRightIn)} ${cssInches(marginBottomIn)} ${cssInches(marginLeftIn)};
        ${debug ? 'outline: 1pt solid #0c0;' : ''}
        page-break-after: always;
        ${bgUrl ? `
          position: relative;
          background-image: url('${bgUrl.replace(/'/g, "\\'")}');
          background-repeat: no-repeat;
          background-origin: border-box;
          background-clip: border-box;
          background-size: ${bgSizePct}% ${bgSizePct}%;
          background-position: calc(50% + ${cssInches(bgOffsetXIn)}) calc(50% + ${cssInches(bgOffsetYIn)});
          /* Apply opacity via overlay to avoid affecting children */
        ` : ''}
      }
      ${bgUrl ? `
      .page::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: inherit;
        background-repeat: inherit;
        background-origin: inherit;
        background-clip: inherit;
        background-size: inherit;
        background-position: inherit;
        opacity: ${bgOpacity};
        z-index: 0;
      }
      .grid { position: relative; z-index: 1; }
      ` : ''}
      .grid {
        display: grid;
        grid-template-columns: repeat(${cols}, ${cssInches(labelWidthIn)});
        grid-template-rows: repeat(${rows}, ${cssInches(labelHeightIn)});
        column-gap: ${cssInches(hGapIn)};
        row-gap: ${cssInches(vGapIn)};
        width: 100%;
        height: 100%;
      }
      .cell {
        box-sizing: border-box;
        width: ${cssInches(labelWidthIn)};
        height: ${cssInches(labelHeightIn)};
      }
      .label {
        box-sizing: border-box; width: 100%; height: 100%;
        display: flex; justify-content: space-between; align-items: stretch;
        padding: ${cssInches(0.05)} ${cssInches(0.05)};
        ${debug ? 'background: repeating-linear-gradient(0deg,#0000, #0000 0.24in, #0001 0.24in, #0001 0.25in);' : ''}
      }
      .left { width: 72%; display: flex; flex-direction: column; justify-content: space-between; height: 100%; text-align: left; }
      .top { flex: 0 0 auto; }
      .middle { flex: 1 1 auto; display: flex; align-items: center; }
      .bottom.meta { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
      .sku { font-size: 17pt; font-weight: bold; margin: 0; line-height: 0.9; letter-spacing: 0.2pt; }
      .title { font-size: 9pt; margin: 0; line-height: 1.0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-align: left; }
      .vendor { font-size: 7pt; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
      .price { font-size: 8pt; line-height: 1.0; font-weight: bold; white-space: nowrap; }
      .right { width: 28%; display: flex; align-items: center; justify-content: center; text-align: center; }
      img { display: block; }
      @media print { .controls { display: none; } }
    </style>
  </head>
  <body>
    ${pagesHtml.join("\n")}
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
  const format = (url.searchParams.get("format") || "").toLowerCase();
  const startOffset = Number(url.searchParams.get("startOffset") || "0");
  const debug = (url.searchParams.get("debug") || "").toLowerCase() === "1";
  // Background overlay options for calibration
  const bgParam = (url.searchParams.get("bg") || "").trim();
  let bgUrl: string | null = null;
  if (bgParam) {
    if (bgParam === '1' || bgParam.toLowerCase() === 's7698') {
      bgUrl = '/templates/S-7698.png';
    } else if (/^https?:\/\//i.test(bgParam) || bgParam.startsWith('/')) {
      bgUrl = bgParam;
    }
  }
  const bgOpacity = Number(url.searchParams.get("bgOpacity") || "0.25");
  const bgSizePct = Number(url.searchParams.get("bgSize") || "100");
  const bgOffsetXIn = Number(url.searchParams.get("bgOffX") || "0");
  const bgOffsetYIn = Number(url.searchParams.get("bgOffY") || "0");

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
  let html: string;
  if (format === "18up") {
    // Prepare presentational items + QR data URLs
    const items = mapVariants(variants, store, currencyCode);
    const withQr = await attachQrDataUrls(items, 200);
    html = renderHtml18Up(withQr, LAYOUT_18UP_LETTER_DEFAULT, {
      startOffset: isNaN(startOffset) ? 0 : startOffset,
      debug,
      bgUrl,
      bgOpacity: isFinite(bgOpacity) ? bgOpacity : 0.25,
      bgSizePct: isFinite(bgSizePct) ? bgSizePct : 100,
      bgOffsetXIn: isFinite(bgOffsetXIn) ? bgOffsetXIn : 0,
      bgOffsetYIn: isFinite(bgOffsetYIn) ? bgOffsetYIn : 0,
    });
  } else if (format === "s7698" || format === "1x3-18" || format === "1x3x18") {
    const items = mapVariants(variants, store, currencyCode);
    const withQr = await attachQrDataUrls(items, 200);
    html = renderHtml18Up(withQr, LAYOUT_S7698_1x3_18UP, {
      startOffset: isNaN(startOffset) ? 0 : startOffset,
      debug,
      bgUrl,
      bgOpacity: isFinite(bgOpacity) ? bgOpacity : 0.25,
      bgSizePct: isFinite(bgSizePct) ? bgSizePct : 100,
      bgOffsetXIn: isFinite(bgOffsetXIn) ? bgOffsetXIn : 0,
      bgOffsetYIn: isFinite(bgOffsetYIn) ? bgOffsetYIn : 0,
    });
  } else {
    html = renderHtmlSingleLabelPerPage(variants, store, currencyCode);
  }

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
