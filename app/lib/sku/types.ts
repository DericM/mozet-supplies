// app/lib/sku/types.ts

// --- Types used by the SKU assigner ---

export type VariantForSku = {
  id: string;
  sku?: string | null;
  selectedOptions?: Array<{ name: string; value: string }>;
};

export type ProductForSku = {
  id: string;
  vendor?: string | null;
  productType?: string | null;
  options?: Array<{ name: string; position: number; values: string[] }>;
  variants: { nodes: VariantForSku[] };
};


/** Minimal surface your code actually uses. */
export type AdminClient = {
  graphql: (
    query: string,
    init?: { variables?: Record<string, unknown> }
  ) => Promise<Response>;
};

// ---- Optional: helpful result shapes for your queries ----
export type ProductQueryResult = {
  data: {
    product: {
      id: string;
      vendor?: string | null;
      productType?: string | null;
      variants: { nodes: Array<{ id: string; sku?: string | null }> };
    } | null;
  };
};

export type BulkUpdateResult = {
  data: {
    productVariantsBulkUpdate: {
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

export type VariantForLabel = {
  id: string;
  sku?: string | null;
  title?: string | null;
  legacyResourceId: string;
  product: {
    title: string;
    vendor?: string | null;
    legacyResourceId: string;
  };
};

export type NodesQueryResult = {
  data?: { nodes: Array<VariantForLabel | null> };
  errors?: Array<{ message: string }>;
};


export type ProductsFallbackResult = {
  data?: {
    products: {
      nodes: Array<{
        title: string;
        vendor?: string | null;
        legacyResourceId: string | number;
        variants: { nodes: Array<{ id: string; sku?: string | null; legacyResourceId: string | number }> };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};


export function isVariantForLabel(v: unknown): v is VariantForLabel {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const p = o.product as Record<string, unknown> | undefined;
  return (
    typeof o.id === "string" &&
    p !== undefined &&
    typeof p.title === "string" &&
    typeof p.legacyResourceId !== "undefined"
  );
}

// tiny helpers to assert presence at runtime
export function assertHasNodes(j: NodesQueryResult): asserts j is Required<Pick<NodesQueryResult, "data">> {
  if (!j.data?.nodes) throw new Error("GraphQL response missing data.nodes");
}

export function assertHasProducts(j: ProductsFallbackResult): asserts j is Required<Pick<ProductsFallbackResult, "data">> {
  if (!j.data?.products?.nodes) throw new Error("GraphQL response missing data.products.nodes");
}

