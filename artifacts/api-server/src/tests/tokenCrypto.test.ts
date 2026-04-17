import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  if (!process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-vitest";
  }
});

import { encryptToken, decryptToken } from "../lib/tokenCrypto";

describe("tokenCrypto", () => {
  it("encrypts and decrypts a token round-trip", () => {
    const original = "test-access-token-abc123";
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for same input", () => {
    const original = "same-token";
    const a = encryptToken(original);
    const b = encryptToken(original);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(original);
    expect(decryptToken(b)).toBe(original);
  });

  it("handles empty strings", () => {
    const encrypted = encryptToken("");
    expect(decryptToken(encrypted)).toBe("");
  });

  it("handles long tokens", () => {
    const long = "a".repeat(2000);
    expect(decryptToken(encryptToken(long))).toBe(long);
  });
});
