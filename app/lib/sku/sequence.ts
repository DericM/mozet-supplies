// app/lib/sku/sequence.ts
import type { AdminClient } from "./types";

/**
 * Reserves and returns the next integer for a given SKU group.
 * Stored in a shop-level metafield: namespace "skus", key "seq_<group>".
 */
export async function reserveNextForGroup(admin: AdminClient, group: string): Promise<number> {
  const namespace = "skus";
  const key = `seq_${group.toLowerCase()}`;

  // 1) Read current value
  const getQ = `#graphql
    query($ns: String!, $key: String!) {
      shop {
        id
        metafield(namespace: $ns, key: $key) { id value type }
      }
    }`;
  const getRes = await admin.graphql(getQ, { variables: { ns: namespace, key } });
  const getJson = await getRes.json() as {
    data?: { shop: { id: string; metafield: { id: string | null; value: string | null } | null } };
    errors?: Array<{ message: string }>;
  };
  if (getJson.errors?.length) {
    throw new Error(`metafield read failed: ${getJson.errors.map(e => e.message).join("; ")}`);
  }

  const shopId = getJson.data?.shop.id;
  if (!shopId) throw new Error("Shop ID missing in metafield read response");

  const current = Number(getJson.data?.shop.metafield?.value ?? "0");
  const next = Number.isFinite(current) ? current + 1 : 1;

  // 2) Write next value
  const setM = `#graphql
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`;
  const mfInput = [{
    ownerId: shopId,
    namespace,
    key,
    type: "number_integer",
    value: String(next),
  }];

  const setRes = await admin.graphql(setM, { variables: { metafields: mfInput } });
  const setJson = await setRes.json() as {
    data?: { metafieldsSet: { userErrors: Array<{ field?: string[]; message: string }> } };
    errors?: Array<{ message: string }>;
  };

  if (setJson.errors?.length) {
    throw new Error(`metafield write transport errors: ${setJson.errors.map(e => e.message).join("; ")}`);
  }
  const ue = setJson.data?.metafieldsSet.userErrors ?? [];
  if (ue.length) {
    throw new Error(`metafield write userErrors: ${ue.map(e => e.message).join("; ")}`);
  }

  return next;
}
