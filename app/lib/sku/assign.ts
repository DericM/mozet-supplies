// app/lib/sku/assign.ts
import type { AdminClient, ProductForSku, VariantForSku } from "./types";
import { groupKey, buildSku, typeToTT, vendorToVV } from "./rules";
import { reserveNextForGroup } from "./sequence";

const PRODUCT_FOR_SKU_Q = `#graphql
  query ($id: ID!) {
    product(id: $id) {
      id
      status
      vendor
      productType
      options { name position values }
      variants(first: 250) {
        nodes {
          id
          sku
          selectedOptions { name value }
        }
      }
    }
  }
`;

const PRODUCT_SET_MUT = `#graphql
  mutation SetSkus($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
    productSet(identifier: $identifier, input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

type VariantSetInput = {
  id: string;
  sku: string;
  optionValues: Array<{ optionName: string; name: string }>;
};

type OptionSetInput = {
  name: string;
  position?: number | null;
  values: Array<{ name: string }>;
};

function buildOptionsInput(
  opts: Array<{ name: string; position: number; values: string[] }> | undefined
): OptionSetInput[] {
  if (!opts || opts.length === 0) {
    // single-variant fallback
    return [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }];
  }
  return opts.map((o) => ({
    name: o.name,
    position: o.position,
    values: o.values.map((v) => ({ name: v })),
  }));
}

function buildVariantOptionValues(v: VariantForSku) {
  const so = v.selectedOptions ?? [];
  return so.length
    ? so.map((o) => ({ optionName: o.name, name: o.value }))
    : [{ optionName: "Title", name: "Default Title" }];
}

export async function ensureSkusForProduct(
  admin: AdminClient,
  productGid: string,
  opts?: { overwrite?: boolean }
) {
  console.log("[assign] begin", productGid);

  const overwrite = Boolean(opts?.overwrite);

  // 1) Load product + variants
  const pRes = await admin.graphql(PRODUCT_FOR_SKU_Q, { variables: { id: productGid } });
  const pJson = (await pRes.json()) as { data?: { product: ProductForSku | null } };
  const product = pJson.data?.product;
  if (!product) return;

  // Skip non-active products (draft/archived)
  if ((product.status ?? "").toUpperCase() !== "ACTIVE") {
    console.log("[assign] skip: product not ACTIVE", { id: product.id, status: product.status });
    return;
  }

  // Require both vendor and productType to be present (non-blank)
  const vendor = (product.vendor ?? "").trim();
  const type = (product.productType ?? "").trim();
  if (!vendor || !type) {
    console.log("[assign] skip: missing vendor/type", { vendor: Boolean(vendor), type: Boolean(type) });
    return;
  }

  // 2) Compute group and current abbreviations
  const typeRaw = product.productType ?? undefined;
  const vendorRaw = product.vendor ?? undefined;
  const group = groupKey(typeRaw, vendorRaw);
  const currTT = typeToTT(typeRaw);
  const currVV = vendorToVV(vendorRaw);

  // Extract existing sequence and prefix (first 4 chars) from any existing SKU
  const extractSeqAndPrefix = (sku?: string | null): { seq: number | null; prefix: string | null } => {
    const s = (sku || "").toUpperCase().trim();
    const m = s.match(/^[A-Z0-9]{4}(\d{3})/);
    if (!m) return { seq: null, prefix: null };
    return { seq: parseInt(m[1]!, 10), prefix: s.slice(0, 4) };
  };

  let existingSeq: number | null = null;
  let existingPrefix: string | null = null;
  for (const v of product.variants.nodes as VariantForSku[]) {
    if (v.sku && v.sku.trim() !== "") {
      const { seq, prefix } = extractSeqAndPrefix(v.sku);
      if (seq && prefix) {
        existingSeq = seq;
        existingPrefix = prefix;
        break;
      }
    }
  }

  const currentPrefixNew = `${currVV}${currTT}`; // new order VVTT
  const currentPrefixOld = `${currTT}${currVV}`; // old order TTVV
  const groupUnchanged = existingPrefix
    ? existingPrefix.startsWith(currentPrefixNew) || existingPrefix.startsWith(currentPrefixOld)
    : false;

  // 3) Decide which variants to update; defer sequence reservation until needed
  type PendingVariant = { id: string; optionValues: Array<{ optionName: string; name: string }>; hasRealOptions: boolean };
  const pending: PendingVariant[] = [];
  for (const v of product.variants.nodes as VariantForSku[]) {
    const hasSku = !!(v.sku && v.sku.trim() !== "");
    if (overwrite || !hasSku) {
      pending.push({
        id: v.id,
        optionValues: buildVariantOptionValues(v),
        hasRealOptions: (v.selectedOptions ?? []).length > 0,
      });
    }
  }
  if (pending.length === 0) {
    console.log("[assign] nothing to do");
    return;
  }

  // 4) Choose sequence: reuse existing when group unchanged; otherwise reserve new
  let seq: number;
  if (existingSeq !== null && groupUnchanged) {
    seq = existingSeq;
  } else {
    seq = await reserveNextForGroup(admin, group);
  }

  // 5) Build final updates with chosen sequence
  const toUpdate: VariantSetInput[] = pending.map((p) => ({
    id: p.id,
    sku: buildSku(
      typeRaw,
      vendorRaw,
      seq,
      p.hasRealOptions ? p.optionValues.map((ov) => ov.name) : []
    ),
    optionValues: p.optionValues,
  }));

  // 6) productSet requires productOptions whenever variants are present
  const optionsInput = buildOptionsInput(
    (product as unknown as { options?: Array<{ name: string; position: number; values: string[] }> }).options
  );

  // 7) Apply in one call
  const mRes = await admin.graphql(PRODUCT_SET_MUT, {
    variables: {
      identifier: { id: productGid },
      input: { productOptions: optionsInput, variants: toUpdate },
    },
  });
  const mJson = (await mRes.json()) as {
    data?: { productSet?: { userErrors?: Array<{ field?: string[]; message: string }> } };
  };
  const errs = mJson.data?.productSet?.userErrors ?? [];
  if (errs.length) {
    console.error("[assign-error]", errs);
    throw new Error(errs.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; "));
  }

  console.log(`[assign] updated ${toUpdate.length} variant SKUs`);
}
