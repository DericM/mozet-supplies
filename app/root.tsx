import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <Meta /><Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration /><Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const err = useRouteError();
  return (
    <html lang="en">
      <head><Meta /><Links /></head>
      <body style={{ padding: 16, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
        <h2>Route Error</h2>
        {isRouteErrorResponse(err) ? (
          <>
            <div>Status: {err.status}</div>
            <div>{err.statusText}</div>
            <div>{JSON.stringify(err.data, null, 2)}</div>
          </>
        ) : err instanceof Error ? err.stack : JSON.stringify(err, null, 2)}
        <Scripts />
      </body>
    </html>
  );
}