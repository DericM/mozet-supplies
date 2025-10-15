// app/routes/app.tsx
import '@shopify/polaris/build/esm/styles.css';
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { AppProvider as AppBridgeProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// app/routes/app.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) throw new Response("Missing SHOPIFY_API_KEY", { status: 500 });

  const appOrigin = new URL(request.url).origin; // ← your tunnel origin here
  return { apiKey, appOrigin };
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function AppLayout() {
  const { apiKey, appOrigin } = useLoaderData<typeof loader>();

  return (
    <PolarisProvider i18n={en}>
      <AppBridgeProvider embedded apiKey={apiKey}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__SHOPIFY_API_KEY__=${JSON.stringify(apiKey)};
              window.__APP_ORIGIN__=${JSON.stringify(appOrigin)};
              (function(){
                try {
                  var h = new URLSearchParams(location.search).get('host');
                  if (h) sessionStorage.setItem('shopify_host', h);
                } catch(e) {}
              })();
            `,
          }}
        />
        <Outlet />
      </AppBridgeProvider>
    </PolarisProvider>
  );
}
