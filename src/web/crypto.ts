// Optional password protection for exported files: AES-GCM with a key derived
// from the password via PBKDF2 (WebCrypto, nothing leaves the browser).

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 600_000;

/** Base64 in chunks: spreading a large buffer into fromCharCode exceeds the argument limit. */
function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedFile {
  format: "vaud-tax-encrypted";
  version: 1;
  salt: string;
  iv: string;
  data: string;
}

export async function encryptJson(value: unknown, password: string): Promise<EncryptedFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return { format: "vaud-tax-encrypted", version: 1, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function decryptJson(file: EncryptedFile, password: string): Promise<unknown> {
  const key = await deriveKey(password, unb64(file.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(file.iv) as BufferSource }, key, unb64(file.data) as BufferSource);
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error("Wrong password or damaged file.");
  }
}

export const isEncrypted = (x: unknown): x is EncryptedFile => (x as EncryptedFile)?.format === "vaud-tax-encrypted";
