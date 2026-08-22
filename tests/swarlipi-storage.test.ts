import { describe, expect, it } from "vitest";

import { getReaderMaxOffset, getReaderOffset, getReaderProgress, getReaderScrollRate, getReaderSliderRatio } from "../lib/reader-safety";
import { clamp, createInitialLibrary, decodeLibrary, encodeLibrary, reorderSavedTexts } from "../lib/swarlipi-storage";

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

  it("keeps a user-selected ordering stable while retaining any unknown or newly created texts", () => {
    const texts = createInitialLibrary(1_700_000_000_000).texts;
    const reordered = reorderSavedTexts(texts, [texts[2].id, texts[0].id, "missing", texts[2].id]);

    expect(reordered.map((text) => text.id)).toEqual([texts[2].id, texts[0].id, texts[1].id, texts[3].id]);
  });
});

describe("SwarLipi reader controls", () => {
  it("keeps scrolling speed and reading progress within their intended limits", () => {
    expect(clamp(-8, 10, 72)).toBe(10);
    expect(clamp(31, 10, 72)).toBe(31);
    expect(clamp(400, 10, 72)).toBe(72);
    expect(clamp(1.8, 0, 1)).toBe(1);
  });

  it("does not calculate imperative reader positions before valid layout metrics exist", () => {
    expect(getReaderMaxOffset(100, 140)).toBe(0);
    expect(getReaderOffset(0.4, 0)).toBe(0);
    expect(getReaderProgress(80, 0)).toBe(0);
    expect(getReaderOffset(0.4, 500)).toBe(200);
    expect(getReaderProgress(220, 500)).toBe(0.44);
  });

  it("maps a finger position to a bounded slider value and persists only valid speed values", () => {
    expect(getReaderSliderRatio(80, 100, 240)).toBe(0);
    expect(getReaderSliderRatio(220, 100, 240)).toBeCloseTo(0.5);
    expect(getReaderSliderRatio(390, 100, 240)).toBe(1);
    expect(getReaderSliderRatio(220, 100, 0)).toBe(0);
    expect(getReaderScrollRate(0, 10, 72)).toBe(10);
    expect(getReaderScrollRate(0.5, 10, 72)).toBe(41);
    expect(getReaderScrollRate(4, 10, 72)).toBe(72);
  });
});
