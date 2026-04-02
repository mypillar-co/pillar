import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ─── CSRF Token Manager ───────────────────────────────────────────────────────
// Dual-source: prefers the in-memory token captured from response headers
// (reliable in all proxy environments), falls back to document.cookie.
let _csrfToken: string | null = null;

function readCsrfToken(): string | null {
  if (_csrfToken) return _csrfToken;
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function captureTokenFromResponse(res: Response): void {
  const token = res.headers.get("x-csrf-token");
  if (token) _csrfToken = token;
}

// Global fetch interceptor — auto-attaches CSRF token to all mutating requests
// and captures fresh tokens from every response.
(function patchFetch() {
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const method = ((init?.method) ?? "GET").toUpperCase();
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    if (isMutating) {
      const token = readCsrfToken();
      if (token) {
        // Use the Headers constructor so both plain-object headers and Headers
        // instances are merged correctly — spread ({ ...headersInstance }) silently
        // drops all entries because Headers doesn't expose enumerable own properties.
        const merged = new Headers(init?.headers);
        merged.set("x-csrf-token", token);
        init = { ...init, headers: merged };
      }
    }

    const res = await _fetch(input, init);
    // Capture any fresh token the server sends back (on GET responses and
    // even on 403 responses so the client can retry immediately).
    captureTokenFromResponse(res);
    return res;
  };
})();

// Pre-warm the CSRF token before React boots by hitting a lightweight endpoint.
// This guarantees the token is in memory before the user can trigger any mutations.
fetch("/api/tiers", { credentials: "include" }).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
