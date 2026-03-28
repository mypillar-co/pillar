export async function uploadImage(file: File): Promise<string> {
  const metaRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Failed to upload image");

  return `/api/storage${objectPath}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_IMAGE_SIZE_MB = 10;
