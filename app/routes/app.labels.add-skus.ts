/* eslint-disable @typescript-eslint/no-explicit-any */
// app/routes/app.labels.add-skus.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureSkusForProduct } from "../lib/sku/assign";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const form = await request.formData();
  const csv = String(form.get("productIds") || "").trim();
  const force = String(form.get("force") || "").toLowerCase();
  const overwrite = force === "1" || force === "true";

  if (!csv) {
    return new Response(JSON.stringify({ ok: false, error: "No productIds provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const productIds = csv.split(",").map((s) => s.trim()).filter(Boolean);

  let updated = 0;
  const errors: string[] = [];

  for (const pid of productIds) {
    try {
      await ensureSkusForProduct(admin, pid, { overwrite });
      updated++;
    } catch (e: any) {
      errors.push(`${pid}: ${e?.message || String(e)}`);
    }
  }

  const ok = errors.length === 0;
  return new Response(JSON.stringify({ ok, updated, errors, overwrite }), {
    status: ok ? 200 : 207, // 207: multi-status
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}