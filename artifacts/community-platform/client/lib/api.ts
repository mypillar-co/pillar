export function apiUrl(path: string): string {
  return path;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...options });
}
