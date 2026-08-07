import { describe, expect, it } from "vitest";
import { decryptField, encryptField, opaqueHash } from "@/lib/security";

describe("security primitives", () => {
  it("encrypts and decrypts MFA material with authenticated encryption", () => {
    process.env.CERTIFERA_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptField("BASE32SECRET");
    expect(ciphertext).not.toContain("BASE32SECRET");
    expect(decryptField(ciphertext)).toBe("BASE32SECRET");
  });

  it("creates deterministic opaque token hashes", () => {
    expect(opaqueHash("certifera-token")).toBe(opaqueHash("certifera-token"));
    expect(opaqueHash("certifera-token")).not.toBe(opaqueHash("another-token"));
  });
});
