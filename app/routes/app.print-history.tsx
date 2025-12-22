/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Page, Card, IndexTable, Text, Button } from "@shopify/polaris";
import { createApp } from "@shopify/app-bridge";
import { useLocation, useMatches } from "react-router";

/**
 * Client-side print history page.
 * Reads from localStorage key `label_print_history`.
 * Each record: { date: ISO string, count: number, skus: string[], ids: string[] }
 */
export default function PrintHistory() {
  type HistoryItem = { date: string; count: number; skus: string[]; ids: string[] };
  const [items, setItems] = useState<HistoryItem[]>([]);
  const location = useLocation();
  const matches = useMatches();
  const parentData: any = Array.isArray(matches) ? matches.find((m: any) => m?.data && typeof m.data === 'object' && 'apiKey' in m.data)?.data : null;
  const apiKeyFromParent: string | undefined = parentData ? (parentData as any).apiKey : undefined;

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("label_print_history") : null;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setItems(
          parsed
            .filter((r: any) => r && typeof r.date === "string" && typeof r.count === "number")
            .slice(0, 25)
        );
      }
    } catch {
      // ignore
    }
  }, []);

  const rows = items ?? [];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  async function reprint(ids: string[]) {
    if (!ids || ids.length === 0) return;
    try {
      const params = new URLSearchParams(location.search);
      params.set("ids", ids.join(","));
      const savedLayout = (typeof window !== "undefined" ? window.localStorage.getItem("print_layout") : null) || "s7698";
      params.set("format", savedLayout);
      if (!params.get("embedded")) params.set("embedded", "1");
      const path = `/app/labels/print?${params.toString()}`;

      const { getSessionToken } = await import("@shopify/app-bridge/utilities");
      const usp = new URLSearchParams(location.search);
      const host = usp.get("host") || (typeof window !== "undefined" ? window.sessionStorage.getItem("shopify_host") || undefined : undefined);
      if (usp.get("host")) {
        try { window.sessionStorage.setItem("shopify_host", usp.get("host")!); } catch {
          // ignore
        }
      }
      const apiKey = apiKeyFromParent;
      if (!apiKey || !host) throw new Error("Missing apiKey/host for App Bridge");
      const app = createApp({ apiKey, host, forceRedirect: true });
      const token = await (getSessionToken as (app: unknown) => Promise<string>)(app);

      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const html = await res.text();

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      let removed = false;
      const waitForImages = async (win: Window, timeoutMs = 3000) => {
        try {
          const doc = win.document as Document;
          const imgs = Array.from(doc.images) as HTMLImageElement[];
          const pending = imgs.filter((img) => !(img.complete && img.naturalWidth > 0));
          if (pending.length === 0) return;
          const loadPromises = pending.map(
            (img) =>
              new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              })
          );
          await Promise.race([
            Promise.all(loadPromises),
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
          ]);
        } catch {
          // ignore
        }
      };
      const cleanup = () => {
        if (removed) return;
        removed = true;
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch {
          // ignore
        }
      };

      const iw = iframe.contentWindow;
      if (!iw) throw new Error("iframe window unavailable");
      iw.document.open();
      iw.document.write(html);
      iw.document.close();

      const onLoad = async () => {
        try {
          await waitForImages(iw, 4000);
          iw.focus();
          iw.addEventListener("afterprint", cleanup, { once: true } as any);
          iw.print();
          setTimeout(cleanup, 5000);
        } catch (e) {
          cleanup();
        }
      };
      if (iw.document.readyState === "complete") onLoad();
      else iw.addEventListener("load", onLoad, { once: true } as any);
    } catch (e) {
      // ignore
    }
  }

  return (
    <Page title="Print History" fullWidth>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text as="h2" variant="headingMd">Print Jobs</Text>
          <Button
            variant="primary"
            disabled={selectedIndex === null}
            onClick={() => {
              if (selectedIndex === null) return;
              const job = rows[selectedIndex];
              if (!job) return;
              reprint(job.ids);
            }}
          >
            Print
          </Button>
        </div>
        <IndexTable
          resourceName={{ singular: "job", plural: "jobs" }}
          itemCount={rows.length}
          selectedItemsCount={selectedIndex === null ? 0 : 1}
          headings={[
            { title: "" },
            { title: "Date" },
            { title: "Label Count" },
            { title: "SKUs" },
          ]}
        >
          {rows.map((job, index) => {
            const date = new Date(job.date);
            const dateStr = isNaN(date.getTime()) ? job.date : date.toLocaleString();
            return (
              <IndexTable.Row
                id={`${index}`}
                key={`${index}`}
                position={index}
                selected={selectedIndex === index}
                onClick={() => setSelectedIndex(index)}
              >
                <IndexTable.Cell>
                  <input
                    type="radio"
                    name="history-select"
                    checked={selectedIndex === index}
                    onChange={() => setSelectedIndex(index)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                  />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">{dateStr}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">{job.count}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {job.skus && job.skus.length > 0 ? job.skus.join(", ") : "—"}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      </Card>
    </Page>
  );
}
