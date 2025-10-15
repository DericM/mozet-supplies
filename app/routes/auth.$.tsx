import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Handle /auth/session-token: immediately navigate to the provided shopify-reload URL
// without modifying it (do not change query params, or HMAC validation can fail).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const reload = url.searchParams.get("shopify-reload");

  if (reload) {
    const dest = reload; // do not alter the URL to preserve HMAC
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Refreshing session…</title>
  <script>
    (function(){
      try {
        var dest = ${JSON.stringify(dest)};
        if (window.top) {
          window.top.location.replace(dest);
        } else {
          window.location.replace(dest);
        }
      } catch (e) {
        document.body.textContent = 'Redirect failed';
      }
    })();
  </script>
  <style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font-family:system-ui,Arial;color:#444}</style>
</head>
<body>Refreshing session…</body>
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

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
