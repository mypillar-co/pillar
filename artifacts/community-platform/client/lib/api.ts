export function apiUrl(path: string): string {
  if (path.startsWith("/api/") && typeof window !== "undefined") {
    const match = window.location.pathname.match(/^\/sites\/([^/]+)/);
    if (match) return `/sites/${match[1]}${path}`;
  }
  return path;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...options });
}
