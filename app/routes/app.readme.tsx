/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Page, Card, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function Readme() {
  return (
    <Page title="README" fullWidth>
      <div style={{ display: "grid", gap: 12 }}>
        {/* Structure */}
        <Card>
          <div style={{ padding: 16, display: "grid", gap: 8 }}>
            <Text as="h3" variant="headingMd">Structure</Text>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>
                SKU format: <code>TTT-VVV-SSSS</code>
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>TTT = 3-character abbreviation of Product Type.</li>
                  <li>VVV = 3-character abbreviation of Vendor.</li>
                  <li>SSSS = 4-digit uppercase hexadecimal sequence (e.g., 000A, 00FF, 1A2B).</li>
                </ul>
              </li>
              <li>Both Vendor and Product Type must be present; otherwise, SKU generation/overwrite is skipped.</li>
            </ul>
          </div>
        </Card>

        {/* Rules */}
        <Card>
          <div style={{ padding: 16, display: "grid", gap: 8 }}>
            <Text as="h3" variant="headingMd">Rules</Text>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>
                Abbreviations (for TTT and VVV)
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>Tokenize the string into word characters (letters/digits), uppercase, strip non-alphanumerics.</li>
                  <li>Multiple words: take the first letter of each word in order until 3 chars (e.g., &quot;Air Conditioner Filter&quot; → ACF). Avoid immediate duplicates.</li>
                  <li>Single word fallback: start with the first char, prefer consonants/digits for remaining slots (skip vowels), then allow vowels if still short. Avoid immediate duplicates. Pad with <code>X</code> to length 3.</li>
                </ul>
              </li>
              <li>
                Group key
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li><code>group = TTT + &apos;-&apos; + VVV</code> computed from the product type and vendor abbreviations.</li>
                </ul>
              </li>
              <li>
                Sequence allocation
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>Per-group, monotonically increasing integer reserved via shop metafield: namespace <code>skus</code>, key <code>seq_&lt;group&gt;</code>.</li>
                  <li>Each assignment reserves the next number; numbers aren&apos;t reused (including overwrite operations).</li>
                </ul>
              </li>
              <li>
                Sequence formatting
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li><code>SSSS = toHex(n).toUpperCase().padStart(4, &apos;0&apos;)</code>. If the value exceeds 4 hex digits, it grows to fit (no truncation).</li>
                </ul>
              </li>
              <li>
                Overwrite behavior
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>When enabled, existing variant SKUs are replaced using newly reserved sequence numbers for the same group.</li>
                  <li>When disabled, only variants with blank SKUs are assigned.</li>
                </ul>
              </li>
              <li>
                Skip conditions
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>Missing vendor or product type → skip.</li>
                  <li>Existing SKU present and overwrite disabled → skip.</li>
                </ul>
              </li>
            </ul>
          </div>
        </Card>

        {/* Examples */}
        <Card>
          <div style={{ padding: 16, display: "grid", gap: 8 }}>
            <Text as="h3" variant="headingMd">Examples</Text>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>Type &quot;Air Conditioner Filter&quot;, Vendor &quot;Acme Tools&quot; → Group <code>ACF-AT</code> → SKUs <code>ACF-AT-000A</code>, <code>ACF-AT-000B</code>, …</li>
              <li>Type &quot;Water Bottle&quot;, Vendor &quot;Blue Ocean&quot; → Group <code>WBT-BO</code> → SKUs <code>WBT-BO-000A</code>, <code>WBT-BO-000B</code>, …</li>
              <li>Overwrite enabled reassigns SKUs and reserves new sequence values: e.g., next becomes <code>...-0010</code> even if earlier values existed.</li>
            </ul>
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <div style={{ padding: 16, display: "grid", gap: 8 }}>
            <Text as="h3" variant="headingMd">Notes</Text>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>Overwriting SKUs reserves new sequence numbers; previous values aren&apos;t reused.</li>
              <li>Auto-SKU via webhooks can be disabled/enabled by an environment flag.</li>
              <li>Session refresh is automatic inside Shopify Admin; if you see a refresh loop, reload the page.</li>
            </ul>
          </div>
        </Card>
      </div>
    </Page>
  );
}
