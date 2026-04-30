function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function uploadImage(file: File): Promise<string> {
  const csrfToken = getCsrfToken();
  const csrfHeader: Record<string, string> = csrfToken ? { "x-csrf-token": csrfToken } : {};

  async function uploadInline(): Promise<string> {
    const directRes = await fetch("/api/storage/uploads/data-url", {
      method: "POST",
      headers: { "Content-Type": file.type, ...csrfHeader },
      credentials: "include",
      body: file,
    });
    if (!directRes.ok) {
      const data = await directRes.json().catch(() => null) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to upload image");
    }
    const { objectPath } = await directRes.json() as { objectPath: string };
    return objectPath;
  }

  const metaRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeader },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) return uploadInline();
  const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Failed to upload image");

  await fetch("/api/storage/uploads/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeader },
    credentials: "include",
    body: JSON.stringify({ objectPath, size: file.size }),
  }).catch(() => {});

  return `/api/storage${objectPath}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_IMAGE_SIZE_MB = 10;
