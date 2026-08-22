import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

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
});
