/* eslint-disable @typescript-eslint/no-explicit-any */
/* Server-side search helpers for Shopify admin GraphQL queries */

// Convert gid://shopify/Product/123 to 123
export function toNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
}

export function escapeSearchToken(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/([+\-!(){}[\]^"~*?:/|&])/g, "\\$1");
}

export function tokenizeQuery(q: string): string[] {
  const raw = q.trim();
  if (!raw) return [];
  const rawTokens = raw.split(/\s+/).filter(Boolean);
  const connectorSet = new Set(["&", "&&", "|", "||", "and", "or", "AND", "OR"]);
  const filtered = rawTokens.filter((t) => {
    if (connectorSet.has(t)) return false; // drop boolean connectors
    if (!/\w/.test(t)) return false; // drop pure punctuation tokens
    return true;
  });
  return filtered.map(escapeSearchToken);
}

export function fieldClauseForToken(t: string): string {
  // Variant field clause only; vendor/product_type is handled via product_ids per token
  return `sku:*${t}* OR title:*${t}* OR product_title:*${t}*`;
}

// Build the productVariants query string for Shopify admin search, optionally narrowing by vendor/type via product IDs.
// Returns null when q is empty.
export async function buildVariantQueryString(
  admin: any,
  q: string,
  opts?: { includeDraft?: boolean; includeArchived?: boolean; includeZero?: boolean }
): Promise<string | null> {
  const tokens = tokenizeQuery(q);
  // Status filtering (defaults to active only unless options request more)
  const statuses: Array<"active" | "draft" | "archived"> = ["active"];
  if (opts?.includeDraft) statuses.push("draft");
  if (opts?.includeArchived) statuses.push("archived");
  // For productVariants search, use product_status:* so filtering happens at the product level in the query.
  const statusClause = `(${statuses
    .map((s) => `product_status:${s}`)
    .join(" OR ")})`;
  // Zero-inventory filtering (default exclude zero when includeZero !== true)
  const zeroInvClause = opts?.includeZero ? null : "inventory_quantity:>0";
  if (!tokens.length) return [statusClause, zeroInvClause].filter(Boolean).join(" AND ");

  const perTokenClauses: string[] = [];
  for (const t of tokens) {
    let productIdsClause: string | null = null;
    try {
      const productStatusClause = `(${statuses
        .map((s) => `status:${s}`)
        .join(" OR ")})`;
      const pQuery = `(${productStatusClause} AND (vendor:${t}* OR product_type:${t}*))`;
      const pResp = await admin.graphql(
        `#graphql
        query ProductsForIds($first:Int!,$query:String){
          products(first:$first, query:$query){
            edges{ node{ id } }
          }
        }`,
        { variables: { first: 250, query: pQuery } }
      );
      const pJson = await pResp.json();
      const ids: string[] = (pJson?.data?.products?.edges ?? []).map((e: any) => toNumericId(e.node.id));
      if (ids.length) productIdsClause = `product_ids:${ids.join(",")}`;
    } catch (_e) {
      // ignore lookup failures; continue without product_ids clause for this token
    }

    const variantClause = `(${fieldClauseForToken(t)})`;
    const tokenClause = productIdsClause ? `(${variantClause} OR ${productIdsClause})` : variantClause;
    perTokenClauses.push(tokenClause);
  }

  return [statusClause, zeroInvClause, ...perTokenClauses].filter(Boolean).join(" AND ");
}
