// app/routes/app.tsx
import '@shopify/polaris/build/esm/styles.css';
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { AppProvider as AppBridgeProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {NavMenu} from '@shopify/app-bridge-react';


// app/routes/app.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) throw new Response("Missing SHOPIFY_API_KEY", { status: 500 });

  return { apiKey };
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <PolarisProvider i18n={en}>
      <AppBridgeProvider embedded apiKey={apiKey}>
        <NavMenu>
          <a href="/app" rel="home">Labels</a>
          <a href="/app/readme">Readme</a>
        </NavMenu>
        <Outlet />
      </AppBridgeProvider>
    </PolarisProvider>
  );
}
