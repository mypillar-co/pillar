type PillarMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export async function pillarRequest(
  path: string,
  method: PillarMethod,
  body?: unknown,
): Promise<unknown> {
  const baseUrl = (process.env.COMMUNITY_PLATFORM_URL || "http://localhost:5001").replace(/\/$/, "");
  const serviceKey = process.env.PILLAR_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error("PILLAR_SERVICE_KEY is not set");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-pillar-service-key": serviceKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Pillar sync ${method} ${path} → ${response.status}: ${JSON.stringify(data)}`,
    );
  }

  return data;
}
