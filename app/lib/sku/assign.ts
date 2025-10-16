// app/lib/sku/assign.ts
import type { AdminClient, ProductForSku, VariantForSku } from "./types";
import { groupKey, formatSku } from "./rules";
import { reserveNextForGroup } from "./sequence";

const PRODUCT_FOR_SKU_Q = `#graphql
  query ($id: ID!) {
    product(id: $id) {
      id
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

  // Require both vendor and productType to be present (non-blank)
  const vendor = (product.vendor ?? "").trim();
  const type = (product.productType ?? "").trim();
  if (!vendor || !type) {
    console.log("[assign] skip: missing vendor/type", { vendor: Boolean(vendor), type: Boolean(type) });
    return;
  }

  // 2) Compute group from product fields
  const group = groupKey(product.productType ?? undefined, product.vendor ?? undefined);

  // 3) Prepare patches
  const toUpdate: VariantSetInput[] = [];
  for (const v of product.variants.nodes as VariantForSku[]) {
    const hasSku = !!(v.sku && v.sku.trim() !== "");
    if (overwrite || !hasSku) {
      const seq = await reserveNextForGroup(admin, group);
      const desired = formatSku(group, seq);
      toUpdate.push({
        id: v.id,
        sku: desired,
        optionValues: buildVariantOptionValues(v),
      });
    }
  }
  if (toUpdate.length === 0) {
    console.log("[assign] nothing to do");
    return;
  }

  // 4) productSet requires productOptions whenever variants are present
  const optionsInput = buildOptionsInput(
    (product as unknown as { options?: Array<{ name: string; position: number; values: string[] }> }).options
  );

  // 5) Apply in one call
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
