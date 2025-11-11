/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import { Page, Card, ChoiceList, Text, Button, InlineStack } from "@shopify/polaris";
import { LAYOUTS, type LayoutKey } from "app/lib/print/layouts";

export async function loader({ request }: LoaderFunctionArgs) {
  // Ensure the user is authenticated and inside the embedded app
  await authenticate.admin(request);
  return null;
}

export default function Settings() {
  const navigate = useNavigate();
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

  return (
    <Page title="Settings">
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Text as="h2" variant="headingMd">Default print layout</Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Choose which label sheet layout to use when printing.
          </Text>
          <ChoiceList
            title="Layouts"
            titleHidden
            selected={[selected]}
            onChange={onChange}
            choices={choices}
          />

          <InlineStack gap="200">
            <Button onClick={() => navigate("/app/labels")}>Back to Labels</Button>
          </InlineStack>
        </div>
      </Card>
    </Page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
