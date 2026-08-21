import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  Annotation,
  clamp,
  createId,
  createInitialLibrary,
  decodeLibrary,
  encodeLibrary,
  LibraryState,
  ReaderPreferences,
  reorderSavedTexts,
  SavedText,
  STORAGE_KEY,
  TextLanguage,
} from "@/lib/swarlipi-storage";

interface CreateTextInput {
  title: string;
  language: TextLanguage;
  body: string;
}

interface SwarLipiContextValue extends LibraryState {
  hydrated: boolean;
  createText: (input: CreateTextInput) => void;
  updateText: (id: string, changes: Partial<Pick<SavedText, "title" | "language" | "body" | "lastReadOffset">>) => void;
  reorderTexts: (orderedIds: string[]) => void;
  deleteText: (id: string) => void;
  addAnnotation: (textId: string, body: string, anchorOffset: number) => void;
  setPreferences: (changes: Partial<ReaderPreferences>) => void;
}

const SwarLipiContext = createContext<SwarLipiContextValue | null>(null);

const persist = (state: LibraryState) => AsyncStorage.setItem(STORAGE_KEY, encodeLibrary(state));

export function SwarLipiProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LibraryState>(() => createInitialLibrary());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const restored = decodeLibrary(raw);
      const next = restored ?? createInitialLibrary();
      if (!restored) void persist(next);
      if (isMounted) {
        setLibrary(next);
        setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, []);

  const commit = useCallback((transform: (current: LibraryState) => LibraryState) => {
    setLibrary((current) => {
      const next = transform(current);
      void persist(next);
      return next;
    });
  }, []);

  const createText = useCallback(
    (input: CreateTextInput) => {
      const timestamp = new Date().toISOString();
      const text: SavedText = {
        id: createId("text"),
        title: input.title.trim(),
        language: input.language,
        body: input.body.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastReadOffset: 0,
      };
      commit((current) => ({ ...current, texts: [text, ...current.texts] }));
    },
    [commit],
  );

  const updateText = useCallback(
    (id: string, changes: Partial<Pick<SavedText, "title" | "language" | "body" | "lastReadOffset">>) => {
      commit((current) => ({
        ...current,
        texts: current.texts.map((text) =>
          text.id === id ? { ...text, ...changes, updatedAt: new Date().toISOString() } : text,
        ),
      }));
    },
    [commit],
  );

  const reorderTexts = useCallback(
    (orderedIds: string[]) => {
      commit((current) => ({ ...current, texts: reorderSavedTexts(current.texts, orderedIds) }));
    },
    [commit],
  );

  const deleteText = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        texts: current.texts.filter((text) => text.id !== id),
        annotations: current.annotations.filter((annotation) => annotation.textId !== id),
      }));
    },
    [commit],
  );

  const addAnnotation = useCallback(
    (textId: string, body: string, anchorOffset: number) => {
      const annotation: Annotation = {
        id: createId("note"),
        textId,
        body: body.trim(),
        anchorOffset: clamp(anchorOffset, 0, 1),
        createdAt: new Date().toISOString(),
      };
      commit((current) => ({ ...current, annotations: [annotation, ...current.annotations] }));
    },
    [commit],
  );

  const setPreferences = useCallback(
    (changes: Partial<ReaderPreferences>) => {
      commit((current) => ({ ...current, preferences: { ...current.preferences, ...changes } }));
    },
    [commit],
  );

  const value = useMemo<SwarLipiContextValue>(
    () => ({ ...library, hydrated, createText, updateText, reorderTexts, deleteText, addAnnotation, setPreferences }),
    [library, hydrated, createText, updateText, reorderTexts, deleteText, addAnnotation, setPreferences],
  );

  return <SwarLipiContext.Provider value={value}>{children}</SwarLipiContext.Provider>;
}

export function useSwarLipi() {
  const context = useContext(SwarLipiContext);
  if (!context) throw new Error("useSwarLipi must be used within SwarLipiProvider");
  return context;
}
