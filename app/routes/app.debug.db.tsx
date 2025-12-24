import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form } from "react-router";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const sessionCount = await prisma.session.count().catch(() => 0);
    const sessions = await prisma.session.findMany({
      select: { id: true, shop: true, isOnline: true, scope: true },
      orderBy: { id: "asc" },
      take: 50,
    }).catch(() => []);
    return { tables: tables?.map((t) => t.name) ?? [], sessionCount, sessions };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const id = String(form.get("id") || "");
  if (!id) return { ok: false, message: "Missing id" };
  try {
    await prisma.session.delete({ where: { id } });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function DebugDb() {
  const data = useLoaderData() as any;
  return (
    <div style={{ padding: 16 }}>
      <h2>DB Debug</h2>
      {data?.error ? (
        <pre style={{ whiteSpace: "pre-wrap", color: "crimson" }}>{String(data.error)}</pre>
      ) : (
        <>
          <h3>Tables</h3>
          <pre>{JSON.stringify(data.tables, null, 2)}</pre>
          <h3>Sessions ({data.sessionCount})</h3>
          <pre>{JSON.stringify(data.sessions, null, 2)}</pre>
          <Form method="post" style={{ marginTop: 12 }}>
            <label>
              Delete Session ID:
              <input name="id" placeholder="offline_shop.myshopify.com" style={{ marginLeft: 8 }} />
            </label>
            <button type="submit" style={{ marginLeft: 8 }}>Delete</button>
          </Form>
        </>
      )}
      <p>Route: /app/debug/db</p>
    </div>
  );
}
