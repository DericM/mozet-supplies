/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
// import { useNavigate } from "react-router"; // no longer used
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import { Page, Card, ChoiceList, Text, Checkbox } from "@shopify/polaris";
import { LAYOUTS, type LayoutKey } from "app/lib/print/layouts";

export async function loader({ request }: LoaderFunctionArgs) {
  // Ensure the user is authenticated and inside the embedded app
  await authenticate.admin(request);
  return null;
}

export default function Settings() {
  // const navigate = useNavigate();
  const [selected, setSelected] = useState<LayoutKey>("s7698");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("print_layout");
      if (saved && (saved === "s7698" || saved === "handcut")) {
        setSelected(saved as LayoutKey);
      }
    } catch {
      // ignore
    }
  }, []);

  function onChange(values: string[]) {
    const val = (values[0] || "s7698") as LayoutKey;
    setSelected(val);
    try {
      window.localStorage.setItem("print_layout", val);
    } catch {
      // ignore
    }
  }

  const choices = [
    { label: LAYOUTS.s7698.name, value: "s7698" },
    { label: LAYOUTS.handcut.name, value: "handcut" },
  ];

  // Search results options: include/exclude zero-inventory variants
  const [includeZeroInv, setIncludeZeroInv] = useState<string>("0"); // default exclude ("1" include, "0" exclude)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("search_include_zero_inventory");
      if (saved === "0" || saved === "1") setIncludeZeroInv(saved);
      else setIncludeZeroInv("0");
    } catch {
      // ignore
    }
  }, []);

  function onToggleIncludeZero(checked: boolean) {
    const v = checked ? "1" : "0";
    setIncludeZeroInv(v);
    try { window.localStorage.setItem("search_include_zero_inventory", v); } catch (_e) { /* ignore */ }
  }

  // Draft / Archived product toggles (default exclude)
  const [includeDraft, setIncludeDraft] = useState<boolean>(false);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  useEffect(() => {
    try {
      const d = window.localStorage.getItem("search_include_draft");
      setIncludeDraft(d === "1");
      const a = window.localStorage.getItem("search_include_archived");
      setIncludeArchived(a === "1");
    } catch {
      // ignore
    }
  }, []);
  function onToggleDraft(checked: boolean) {
    setIncludeDraft(checked);
    try { window.localStorage.setItem("search_include_draft", checked ? "1" : "0"); } catch (_e) { /* ignore */ }
  }
  function onToggleArchived(checked: boolean) {
    setIncludeArchived(checked);
    try { window.localStorage.setItem("search_include_archived", checked ? "1" : "0"); } catch (_e) { /* ignore */ }
  }

  return (
    <Page title="Settings">
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Text as="h2" variant="headingMd">Default print layout</Text>
          <ChoiceList
            title="Layouts"
            titleHidden
            selected={[selected]}
            onChange={onChange}
            choices={choices}
          />

          <div style={{ height: 8 }} />
          <Text as="h2" variant="headingMd">Search results</Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Checkbox
              label="Include variants with 0 inventory"
              checked={includeZeroInv === "1"}
              onChange={onToggleIncludeZero}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Checkbox
                label="Include draft products"
                checked={includeDraft}
                onChange={onToggleDraft}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Checkbox
                label="Include archived products"
                checked={includeArchived}
                onChange={onToggleArchived}
              />
            </div>
          </div>

          <div style={{ height: 8 }} />
          <Text as="h2" variant="headingMd">SKUs</Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OverwriteSkusSetting />
          </div>
        </div>
      </Card>
    </Page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);

function OverwriteSkusSetting() {
  const [overwriteSkus, setOverwriteSkus] = useState<boolean>(false);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sku_overwrite");
      setOverwriteSkus(v === "1");
    } catch {
      // ignore
    }
  }, []);
  function onToggle(checked: boolean) {
    setOverwriteSkus(checked);
    try { window.localStorage.setItem("sku_overwrite", checked ? "1" : "0"); } catch (_e) { /* ignore */ }
  }
  return (
    <Checkbox
      label="Overwrite existing SKUs when adding"
      checked={overwriteSkus}
      onChange={onToggle}
    />
  );
}
