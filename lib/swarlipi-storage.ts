export const STORAGE_KEY = "swarlipi.library.v1";

export const LANGUAGE_OPTIONS = ["Marathi", "Hindi", "English", "Awadhi", "Sanskrit", "Other"] as const;

export type TextLanguage = (typeof LANGUAGE_OPTIONS)[number] | string;

export interface SavedText {
  id: string;
  title: string;
  language: TextLanguage;
  body: string;
  createdAt: string;
  updatedAt: string;
  lastReadOffset: number;
}

export interface Annotation {
  id: string;
  textId: string;
  body: string;
  anchorOffset: number;
  createdAt: string;
}

export interface ReaderPreferences {
  fontScale: number;
  scrollRate: number;
}

export interface LibraryState {
  texts: SavedText[];
  annotations: Annotation[];
  preferences: ReaderPreferences;
}

const minutesAgo = (minutes: number, now: number) => new Date(now - minutes * 60_000).toISOString();

export function createInitialLibrary(now = Date.now()): LibraryState {
  return {
    texts: [
      {
        id: "welcome-marathi",
        title: "जपलेले शब्द",
        language: "Marathi",
        body: "आजच्या दिवसातून काही शब्द जपून ठेवले.\n\nमनातल्या शांत जागेत ते पुन्हा वाचता येतील.\n\nप्रत्येक ओळ आपल्याला थोडे अधिक जवळ आणते.",
        createdAt: minutesAgo(18, now),
        updatedAt: minutesAgo(8, now),
        lastReadOffset: 0,
      },
      {
        id: "welcome-hindi",
        title: "एक शांत जगह",
        language: "Hindi",
        body: "कुछ शब्द सिर्फ पढ़ने के लिए नहीं होते।\n\nवे उस पल को फिर से महसूस करने के लिए होते हैं, जब वे लिखे गए थे।\n\nउन्हें अपनी गति से ऊपर बहने दीजिए।",
        createdAt: minutesAgo(90, now),
        updatedAt: minutesAgo(65, now),
        lastReadOffset: 0,
      },
      {
        id: "welcome-english",
        title: "A small place to return to",
        language: "English",
        body: "Keep the lines you do not want to lose.\n\nRead them slowly, let them move, and return whenever the moment asks for them.\n\nYour library stays close, even without a connection.",
        createdAt: minutesAgo(300, now),
        updatedAt: minutesAgo(240, now),
        lastReadOffset: 0,
      },
      {
        id: "welcome-sanskrit",
        title: "वाणी स्मृतिः",
        language: "Sanskrit",
        body: "शब्दाः स्मृतिं वहन्ति।\n\nस्मृतिः मनसि प्रकाशते।\n\nप्रत्येकं वाक्यं पुनः पठनीयम् अस्ति।",
        createdAt: minutesAgo(900, now),
        updatedAt: minutesAgo(780, now),
        lastReadOffset: 0,
      },
    ],
    annotations: [],
    preferences: { fontScale: 1, scrollRate: 24 },
  };
}

export function encodeLibrary(state: LibraryState): string {
  return JSON.stringify(state);
}

export function decodeLibrary(raw: string | null): LibraryState | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<LibraryState>;
    if (!Array.isArray(candidate.texts) || !Array.isArray(candidate.annotations) || !candidate.preferences) {
      return null;
    }

    const textsAreValid = candidate.texts.every(
      (text) =>
        text &&
        typeof text.id === "string" &&
        typeof text.title === "string" &&
        typeof text.language === "string" &&
        typeof text.body === "string" &&
        typeof text.lastReadOffset === "number",
    );
    const annotationsAreValid = candidate.annotations.every(
      (annotation) =>
        annotation &&
        typeof annotation.id === "string" &&
        typeof annotation.textId === "string" &&
        typeof annotation.body === "string" &&
        typeof annotation.anchorOffset === "number",
    );

    if (!textsAreValid || !annotationsAreValid) return null;

    return {
      texts: candidate.texts as SavedText[],
      annotations: candidate.annotations as Annotation[],
      preferences: {
        fontScale: typeof candidate.preferences.fontScale === "number" ? candidate.preferences.fontScale : 1,
        scrollRate: typeof candidate.preferences.scrollRate === "number" ? candidate.preferences.scrollRate : 24,
      },
    };
  } catch {
    return null;
  }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
