import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string): string {
  if (path.startsWith("/api")) return `${base}${path}`;
  return path;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const path = (queryKey as string[]).join("/");
        const url = apiUrl(path);
        const res = await fetch(url, { credentials: "include" });
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
