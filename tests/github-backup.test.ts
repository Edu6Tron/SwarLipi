import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (length: number) => Uint8Array.from({ length }, (_, index) => (index * 29 + 17) % 256),
}));

import { createEncryptedLibraryBackup, decryptEncryptedLibraryBackup } from "../lib/github-backup";
import { createInitialLibrary } from "../lib/swarlipi-storage";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, "btoa", { value: (value: string) => Buffer.from(value, "binary").toString("base64"), configurable: true });
  Object.defineProperty(globalThis, "atob", { value: (value: string) => Buffer.from(value, "base64").toString("binary"), configurable: true });
});

describe("encrypted SwarLipi backups", () => {
  it("encrypts a complete local library and restores it only with the same passphrase", async () => {
    const library = createInitialLibrary();
    const envelope = await createEncryptedLibraryBackup(library, "a safe backup passphrase");
    const restored = await decryptEncryptedLibraryBackup(envelope, "a safe backup passphrase");

    expect(envelope.ciphertext).not.toContain(library.texts[0]?.body ?? "");
    expect(restored).toEqual(library);
  });

  it("rejects an incorrect passphrase", async () => {
    const envelope = await createEncryptedLibraryBackup(createInitialLibrary(), "a safe backup passphrase");
    await expect(decryptEncryptedLibraryBackup(envelope, "not the right passphrase")).rejects.toThrow("could not be opened");
  });

  it("opens the same encrypted envelope through the native fallback and browser Web Crypto", async () => {
    const library = createInitialLibrary();
    const passphrase = "a safe backup passphrase";
    const browserEnvelope = await createEncryptedLibraryBackup(library, passphrase);

    const originalCrypto = globalThis.crypto;
    const originalBtoa = globalThis.btoa;
    const originalAtob = globalThis.atob;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    Object.defineProperty(globalThis, "btoa", { value: undefined, configurable: true });
    Object.defineProperty(globalThis, "atob", { value: undefined, configurable: true });
    try {
      expect(await decryptEncryptedLibraryBackup(browserEnvelope, passphrase)).toEqual(library);
      const nativeEnvelope = await createEncryptedLibraryBackup(library, passphrase);

      Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
      Object.defineProperty(globalThis, "btoa", { value: originalBtoa, configurable: true });
      Object.defineProperty(globalThis, "atob", { value: originalAtob, configurable: true });
      expect(await decryptEncryptedLibraryBackup(nativeEnvelope, passphrase)).toEqual(library);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
      Object.defineProperty(globalThis, "btoa", { value: originalBtoa, configurable: true });
      Object.defineProperty(globalThis, "atob", { value: originalAtob, configurable: true });
    }
  });
});
