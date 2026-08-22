import * as ExpoCrypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { decodeLibrary } from "./swarlipi-storage";
import type { LibraryState } from "./swarlipi-storage";

const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

function getWebCrypto() {
  const browserCrypto = typeof window !== "undefined" ? window.crypto : undefined;
  const runtimeCrypto = globalThis.crypto;
  return [browserCrypto, runtimeCrypto].find((candidate) => candidate?.subtle) ?? null;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    const chunk = 8_192;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
    }
    return globalThis.btoa(binary);
  }

  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    result += BASE64_ALPHABET[first >> 2];
    result += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    result += index + 1 < bytes.length ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)] : "=";
    result += index + 2 < bytes.length ? BASE64_ALPHABET[third & 0x3f] : "=";
  }
  return result;
}

function base64ToBytes(value: string) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  const compact = value.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((compact.length * 6) / 8));
  let buffer = 0;
  let bitCount = 0;
  let outputIndex = 0;
  for (const character of compact) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(character);
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outputIndex] = (buffer >> bitCount) & 0xff;
      outputIndex += 1;
    }
  }
  return bytes;
}

async function createRandomBytes(length: number) {
  const cryptoApi = getWebCrypto();
  if (cryptoApi) return cryptoApi.getRandomValues(new Uint8Array(length));
  return ExpoCrypto.getRandomBytesAsync(length);
}

async function deriveNativeKey(passphrase: string, salt: Uint8Array) {
  return pbkdf2Async(sha256, new TextEncoder().encode(passphrase), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
    asyncTick: 16,
  });
}

async function deriveWebKey(passphrase: string, salt: Uint8Array, cryptoApi: Crypto) {
  const source = await cryptoApi.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array) {
  const cryptoApi = getWebCrypto();
  if (cryptoApi) {
    const key = await deriveWebKey(passphrase, salt, cryptoApi);
    return new Uint8Array(await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, plaintext.buffer as ArrayBuffer));
  }
  return gcm(await deriveNativeKey(passphrase, salt), iv).encrypt(plaintext);
}

async function decrypt(ciphertext: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array) {
  const cryptoApi = getWebCrypto();
  if (cryptoApi) {
    const key = await deriveWebKey(passphrase, salt, cryptoApi);
    return new Uint8Array(await cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    ));
  }
  return gcm(await deriveNativeKey(passphrase, salt), iv).decrypt(ciphertext);
}

export async function createEncryptedLibraryBackup(library: LibraryState, passphrase: string): Promise<EncryptedBackupEnvelope> {
  if (passphrase.trim().length < 12) throw new Error("Use a passphrase with at least 12 characters.");

  const salt = await createRandomBytes(16);
  const iv = await createRandomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(library));
  const ciphertext = await encrypt(plaintext, passphrase, salt, iv);

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
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptEncryptedLibraryBackup(envelope: EncryptedBackupEnvelope, passphrase: string): Promise<LibraryState> {
  if (envelope.version !== BACKUP_VERSION) throw new Error("This SwarLipi backup format is not supported.");
  const salt = base64ToBytes(envelope.encryption.salt);
  const iv = base64ToBytes(envelope.encryption.iv);
  try {
    const plaintext = await decrypt(base64ToBytes(envelope.ciphertext), passphrase, salt, iv);
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
