/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (args) => boundary.headers(args);

export async function loader({ request }: LoaderFunctionArgs) {
  // Do NOT require admin auth here. This page only exists to perform a client-side
  // App Bridge redirect and should be publicly reachable in embedded context.
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);

  const ids = params.get("ids");
  if (!ids) return new Response("Missing ids", { status: 400 });
  if (!params.get("embedded")) params.set("embedded", "1");

  const destination = new URL(`/app/labels/print?${params.toString()}`, url.origin).toString();
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Preparing labels…</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
  <script>
    (function(){
      var search = new URLSearchParams(window.location.search);
      var host = search.get('host');
      if (!host) {
        document.body.textContent = 'Missing host';
        return;
      }
      var app = window['app-bridge'].default({
        apiKey: ${JSON.stringify(apiKey)},
        host: host,
        forceRedirect: true
      });
      var Redirect = window['app-bridge'].actions.Redirect;
      var redirect = Redirect.create(app);

      var dest = new URL(${JSON.stringify(destination)});
      redirect.dispatch(Redirect.Action.REMOTE, dest.toString());
    })();
  </script>
  <style>
    html,body{height:100%;margin:0}
    body{display:grid;place-items:center;font-family:system-ui,Arial;color:#444}
  </style>
</head>
<body>Preparing your labels…</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
