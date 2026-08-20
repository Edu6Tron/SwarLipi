import { describe, expect, it } from "vitest";

import { clamp, createInitialLibrary, decodeLibrary, encodeLibrary } from "../lib/swarlipi-storage";

describe("SwarLipi local library format", () => {
  it("round-trips saved text, reader progress, and preferences through device storage data", () => {
    const library = createInitialLibrary(1_700_000_000_000);
    library.texts[0].lastReadOffset = 0.42;
    library.preferences.scrollRate = 54;

    const restored = decodeLibrary(encodeLibrary(library));

    expect(restored).toEqual(library);
    expect(restored?.texts[0].lastReadOffset).toBe(0.42);
    expect(restored?.preferences.scrollRate).toBe(54);
  });

  it("rejects malformed local data instead of attempting to render it", () => {
    expect(decodeLibrary("not-json")).toBeNull();
    expect(decodeLibrary(JSON.stringify({ texts: [], annotations: [] }))).toBeNull();
    expect(decodeLibrary(null)).toBeNull();
  });
});

describe("SwarLipi reader controls", () => {
  it("keeps scrolling speed and reading progress within their intended limits", () => {
    expect(clamp(-8, 10, 72)).toBe(10);
    expect(clamp(31, 10, 72)).toBe(31);
    expect(clamp(400, 10, 72)).toBe(72);
    expect(clamp(1.8, 0, 1)).toBe(1);
  });
});
