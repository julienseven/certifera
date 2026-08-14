import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

function fieldKey() {
  const raw = process.env.CERTIFERA_FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("CERTIFERA_FIELD_ENCRYPTION_KEY is required to enable MFA.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CERTIFERA_FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptField(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptField(payload: string) {
  const [ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Encrypted field payload is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function createTotpSetup(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({ issuer: "Certifera", label: email, algorithm: "SHA1", digits: 6, period: 30, secret });
  return { secret: secret.base32, uri: totp.toString() };
}

export function validateTotp(secretBase32: string, token: string) {
  const totp = new OTPAuth.TOTP({ issuer: "Certifera", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) });
  return totp.validate({ token, window: 1 }) !== null;
}

export function opaqueHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function authLinksExposed() {
  return process.env.CERTIFERA_EXPOSE_AUTH_LINKS === "true" && process.env.NODE_ENV !== "production";
}
