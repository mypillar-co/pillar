const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (path.startsWith("/api")) return `${base}${path}`;
  return path;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...options });
}
