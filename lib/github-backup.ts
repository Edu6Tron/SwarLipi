import { decodeLibrary } from "./swarlipi-storage";
import type { LibraryState } from "./swarlipi-storage";

const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;

export interface EncryptedBackupEnvelope {
  version: number;
  createdAt: string;
  encryption: {
    algorithm: "AES-GCM";
    kdf: "PBKDF2-SHA-256";
    iterations: number;
    salt: string;
    iv: string;
  };
  ciphertext: string;
}

function ensureBrowserCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Encrypted browser backups are available in a modern web browser.");
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 8_192;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const source = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createEncryptedLibraryBackup(library: LibraryState, passphrase: string): Promise<EncryptedBackupEnvelope> {
  ensureBrowserCrypto();
  if (passphrase.trim().length < 12) throw new Error("Use a passphrase with at least 12 characters.");

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(library));
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, plaintext.buffer as ArrayBuffer);

  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptEncryptedLibraryBackup(envelope: EncryptedBackupEnvelope, passphrase: string): Promise<LibraryState> {
  ensureBrowserCrypto();
  if (envelope.version !== BACKUP_VERSION) throw new Error("This SwarLipi backup format is not supported.");
  const salt = base64ToBytes(envelope.encryption.salt);
  const iv = base64ToBytes(envelope.encryption.iv);
  const key = await deriveKey(passphrase, salt);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      base64ToBytes(envelope.ciphertext).buffer as ArrayBuffer,
    );
    const decoded = decodeLibrary(new TextDecoder().decode(plaintext));
    if (!decoded) throw new Error("This backup does not contain a valid SwarLipi library.");
    return decoded;
  } catch {
    throw new Error("The backup could not be opened. Check your passphrase and backup file.");
  }
}

export function encryptedBackupFileName(createdAt: string) {
  return `swarlipi-backup-${createdAt.replace(/[:.]/g, "-")}.swarlipi.enc`;
}

export function downloadEncryptedBackup(envelope: EncryptedBackupEnvelope) {
  ensureBrowserCrypto();
  const blob = new Blob([JSON.stringify(envelope)], { type: "application/vnd.swarlipi.encrypted+json" });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = encryptedBackupFileName(envelope.createdAt);
  globalThis.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.URL.revokeObjectURL(url);
}

export function getGitHubBackupServiceUrl() {
  return process.env.EXPO_PUBLIC_GITHUB_BACKUP_SERVICE_URL?.replace(/\/$/, "") ?? "";
}

export function beginGitHubBackupAuthorization() {
  ensureBrowserCrypto();
  const serviceUrl = getGitHubBackupServiceUrl();
  if (!serviceUrl) throw new Error("The optional private GitHub connection service has not been configured yet.");
  const returnTo = `${globalThis.location.origin}${globalThis.location.pathname}`;
  globalThis.location.assign(`${serviceUrl}/auth/github/start?returnTo=${encodeURIComponent(returnTo)}`);
}

async function callGitHubBackupService(path: string, init: RequestInit) {
  const serviceUrl = getGitHubBackupServiceUrl();
  if (!serviceUrl) throw new Error("The optional private GitHub connection service has not been configured yet.");
  const response = await fetch(`${serviceUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; repository?: string; updatedAt?: string };
  if (!response.ok) throw new Error(payload.error ?? "The private GitHub backup request was not accepted.");
  return payload;
}

export async function selectGitHubBackupRepository(repository: string) {
  return callGitHubBackupService("/connection/repository", { method: "POST", body: JSON.stringify({ repository }) });
}

export async function uploadEncryptedBackupToGitHub(envelope: EncryptedBackupEnvelope) {
  return callGitHubBackupService("/backup/latest", { method: "POST", body: JSON.stringify(envelope) });
}
