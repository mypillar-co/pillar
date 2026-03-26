import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY env var not set");
  }
  return scryptSync(secret, "steward-social-salt", KEY_LENGTH);
}

export function encryptToken(plaintext: string): string {
  let key: Buffer;
  try {
    key = getEncryptionKey();
  } catch {
    return `plain:${plaintext}`;
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string): string {
  if (ciphertext.startsWith("plain:")) {
    return ciphertext.slice(6);
  }
  let key: Buffer;
  try {
    key = getEncryptionKey();
  } catch {
    return ciphertext;
  }
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
