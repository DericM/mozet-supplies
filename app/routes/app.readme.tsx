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
        {/* SKU Generation (combined) */}
        <Card>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            <Text as="h2" variant="headingLg">SKU Generation</Text>

            {/* Structure */}
            <div style={{ display: "grid", gap: 8 }}>
              <Text as="h3" variant="headingMd">Structure</Text>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                <li>
                  SKU format: <code>TTVVSSS[OO...]</code> (concatenated, no hyphens)
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li>TT = 2-character abbreviation of Product Type.</li>
                    <li>VV = 2-character abbreviation of Vendor.</li>
                    <li>SSS = 3-digit decimal sequence, zero-padded.</li>
                    <li>OO.. = for each selected option value, append a 2-character abbreviation in order (optional).</li>
                  </ul>
                </li>
                <li>Both Vendor and Product Type must be present; otherwise, SKU generation/overwrite is skipped.</li>
              </ul>
            </div>

            {/* Rules */}
            <div style={{ display: "grid", gap: 8 }}>
              <Text as="h3" variant="headingMd">Rules</Text>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                <li>
                  Abbreviations
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li>Tokenize into words (letters/digits), uppercase, strip non-alphanumerics.</li>
                    <li>Build a left-to-right candidate list with priorities:
                      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                        <li>Priority 1: first letter of each word.</li>
                        <li>Priority 2: non-leading consonants and digits.</li>
                        <li>Priority 3: vowels and downgraded consecutive duplicate consonants.</li>
                      </ul>
                    </li>
                    <li>Eliminate from right-to-left by priority (3 → 2 → 1) until desired length (2 or 3) remains. If still over, keep left-most.</li>
                    <li>If shorter than target length, pad with <code>X</code>.</li>
                    <li>Used lengths:
                      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                        <li>TT, VV, and each OO: 2 characters.</li>
                        <li>Group key components TTT and VVV: 3 characters.</li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li>
                  Group key
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li><code>group = TTT + &apos;-&apos; + VVV</code> computed from the 3-character type/vendor abbreviations.</li>
                  </ul>
                </li>
                <li>
                  Sequence allocation
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li>Per-group, monotonically increasing integer reserved via shop metafield: namespace <code>skus</code>, key <code>seq_&lt;group&gt;</code>.</li>
                    <li>Each assignment reserves the next number; numbers aren&apos;t reused (including overwrite operations).</li>
                    <li>We reserve once per product update and apply to all of its variants (variant uniqueness comes from option suffixes).</li>
                  </ul>
                </li>
                <li>
                  Sequence formatting
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li><code>SSS = String(n).padStart(3, &apos;0&apos;)</code> (decimal). No hyphens in the final SKU.</li>
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
                  Options suffix
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    <li>For each selected option value, append a 2-character abbreviation (same algorithm as TT/VV) in the provided option order.</li>
                    <li>Single-variant products use Title/Default Title internally to satisfy Shopify but do not add an option suffix.</li>
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

            {/* Examples */}
            <div style={{ display: "grid", gap: 8 }}>
              <Text as="h3" variant="headingMd">Examples</Text>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                <li>Type &quot;Air Conditioner Filter&quot;, Vendor &quot;Acme Tools&quot; → Group <code>ACF-ACM</code> (example) → SKU with seq 001 and options Color=Dark Blue, Size=Large → <code>AC001DBLG</code> (illustrative; actual TT/VV depend on abbreviation rules).</li>
                <li>Type &quot;Water Bottle&quot;, Vendor &quot;Blue Ocean&quot; → Group <code>WBT-BOC</code> (example) → <code>WB001</code> for single-variant, or <code>WB001ST</code> if option &quot;Steel&quot; exists.</li>
                <li>Overwrite enabled reassigns SKUs and reserves a new sequence (e.g., next becomes <code>...002</code>) even if earlier values existed.</li>
              </ul>
            </div>
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
