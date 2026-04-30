import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

function apiUrl(path: string): string {
  if (path.startsWith("/api/") && typeof window !== "undefined") {
    const match = window.location.pathname.match(/^\/sites\/([^/]+)/);
    if (match) return `/sites/${match[1]}${path}`;
  }
  return path;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const path = (queryKey as string[]).join("/");
        const res = await fetch(apiUrl(path), { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
