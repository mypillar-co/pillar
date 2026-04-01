import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global fetch interceptor — automatically attach CSRF token to all
// state-changing requests (POST / PUT / PATCH / DELETE).
// This covers every fetch call in the app without requiring per-file changes.
(function patchFetch() {
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const method = ((init?.method) ?? "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
      const token = match ? decodeURIComponent(match[1]) : null;
      if (token) {
        init = {
          ...init,
          headers: {
            "x-csrf-token": token,
            ...init?.headers,
          },
        };
      }
    }
    return _fetch(input, init);
  };
})();

createRoot(document.getElementById("root")!).render(<App />);
