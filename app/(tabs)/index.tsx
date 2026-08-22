import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { feedback } from "@/lib/haptics";
import { getReaderMaxOffset, getReaderOffset, getReaderProgress, getReaderScrollRate, getReaderSliderRatio } from "@/lib/reader-safety";
import { useSwarLipi } from "@/lib/swarlipi-store";
import { Annotation, clamp, LANGUAGE_OPTIONS, SavedText, TextLanguage } from "@/lib/swarlipi-storage";

const { height: WINDOW_HEIGHT } = Dimensions.get("window");
const ALL_FILTER = "All";
const SPEED_MIN = 10;
const SPEED_MAX = 72;

interface ReaderSliderProps {
  accessibilityLabel: string;
  children: ReactNode;
  onSlidingComplete?: (value: number) => void;
  onSlidingStart?: () => void;
  onValueChange: (value: number) => void;
  value: number;
}

function ReaderSlider({ accessibilityLabel, children, onSlidingComplete, onSlidingStart, onValueChange, value }: ReaderSliderProps) {
  const sliderRef = useRef<View>(null);
  const boundsRef = useRef({ pageX: 0, width: 1 });
  const lastValueRef = useRef(value);

  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  const measureTrack = useCallback(() => {
    requestAnimationFrame(() => {
      sliderRef.current?.measure((_x, _y, width, _height, pageX) => {
        boundsRef.current = { pageX, width: Math.max(width, 1) };
      });
    });
  }, []);

  const updateFromPageX = useCallback((pageX: number) => {
    const next = getReaderSliderRatio(pageX, boundsRef.current.pageX, boundsRef.current.width);
    lastValueRef.current = next;
    onValueChange(next);
  }, [onValueChange]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      onSlidingStart?.();
      updateFromPageX(event.nativeEvent.pageX);
    },
    onPanResponderMove: (event) => updateFromPageX(event.nativeEvent.pageX),
    onPanResponderRelease: (event) => {
      const next = getReaderSliderRatio(event.nativeEvent.pageX, boundsRef.current.pageX, boundsRef.current.width);
      lastValueRef.current = next;
      onValueChange(next);
      onSlidingComplete?.(next);
    },
    onPanResponderTerminate: () => onSlidingComplete?.(lastValueRef.current),
    onStartShouldSetPanResponder: () => true,
  }), [onSlidingComplete, onSlidingStart, onValueChange, updateFromPageX]);

  return (
    <View
      ref={sliderRef}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value, 0, 1) * 100) }}
      onLayout={measureTrack}
      style={styles.readerSliderTouch}
      {...responder.panHandlers}
    >
      {children}
    </View>
  );
}

function formatPreview(body: string) {
  return body.replace(/\s+/g, " ").trim();
}

function formatUpdated(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function documentAccent(language: string): [string, string] {
  const palette: Record<string, [string, string]> = {
    Marathi: ["#CC536C", "#5D1D31"],
    Hindi: ["#E88652", "#6F2B20"],
    English: ["#6C73E8", "#232758"],
    Awadhi: ["#CB6B9C", "#54213F"],
    Sanskrit: ["#BB8A49", "#5A3B1F"],
    Other: ["#4EAA9C", "#1E5049"],
  };
  return palette[language] ?? palette.Other;
}

function annotationLabel(annotation: Annotation) {
  return `${Math.round(annotation.anchorOffset * 100)}% · ${formatUpdated(annotation.createdAt)}`;
}

interface DocumentCardProps {
  item: SavedText;
  index: number;
  annotationCount: number;
  onOpen: () => void;
  onManage: () => void;
}

function DocumentCard({ item, index, annotationCount, onOpen, onManage }: DocumentCardProps) {
  const accent = documentAccent(item.language);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 42).duration(260)} exiting={FadeOut.duration(160)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.title}`}
        onPress={() => {
          feedback.tap();
          onOpen();
        }}
        onLongPress={() => {
          feedback.select();
          onManage();
        }}
        style={({ pressed }) => [styles.cardShell, pressed && styles.pressedCard]}
      >
        <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardAccent}>
          <Text style={styles.cardInitial}>{item.title.trim().slice(0, 1) || "•"}</Text>
        </LinearGradient>
        <View style={styles.cardCopy}>
          <View style={styles.cardMetaRow}>
            <Text style={styles.languageLabel}>{item.language}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.updatedLabel}>{formatUpdated(item.updatedAt)}</Text>
          </View>
          <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
          <Text numberOfLines={2} style={styles.cardPreview}>{formatPreview(item.body)}</Text>
          <View style={styles.cardFooter}>
            <View style={styles.annotationPill}>
              <MaterialIcons name="notes" size={14} color="#D9B9AE" />
              <Text style={styles.annotationPillText}>{annotationCount} note{annotationCount === 1 ? "" : "s"}</Text>
            </View>
            {item.lastReadOffset > 0.02 ? <Text style={styles.resumeLabel}>Resume {Math.round(item.lastReadOffset * 100)}%</Text> : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Manage ${item.title}`}
          hitSlop={12}
          onPress={(event) => {
            event.stopPropagation();
            feedback.select();
            onManage();
          }}
          style={({ pressed }) => [styles.cardMore, pressed && styles.iconPressed]}
        >
          <MaterialIcons name="more-horiz" size={22} color="#E8D9D1" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

interface ComposerSheetProps {
  visible: boolean;
  editingText: SavedText | null;
  onDismiss: () => void;
}

function ComposerSheet({ visible, editingText, onDismiss }: ComposerSheetProps) {
  const { createText, updateText } = useSwarLipi();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<TextLanguage>("Marathi");
  const [body, setBody] = useState("");
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(editingText?.title ?? "");
    setLanguage(editingText?.language ?? "Marathi");
    setBody(editingText?.body ?? "");
    setAttemptedSave(false);
  }, [editingText, visible]);

  const canSave = title.trim().length > 0 && body.trim().length > 0;
  const isEditing = Boolean(editingText);

  function save() {
    setAttemptedSave(true);
    if (!canSave) {
      feedback.error();
      return;
    }
    if (editingText) {
      updateText(editingText.id, { title: title.trim(), language, body: body.trim() });
    } else {
      createText({ title, language, body });
    }
    feedback.confirm();
    onDismiss();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.composerRoot}>
        <View style={styles.composerHeader}>
          <Pressable onPress={onDismiss} hitSlop={12} style={({ pressed }) => [styles.roundIcon, pressed && styles.iconPressed]}>
            <MaterialIcons name="close" size={22} color="#FFF8F2" />
          </Pressable>
          <View style={styles.composerTitleWrap}>
            <Text style={styles.composerEyebrow}>{isEditing ? "REFINE YOUR WORDS" : "NEW TEXT"}</Text>
            <Text style={styles.composerTitle}>{isEditing ? "Edit text" : "Save a new text"}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEditing ? "Save edits" : "Save text"}
            onPress={save}
            style={({ pressed }) => [styles.saveButton, (!canSave || pressed) && styles.saveButtonPressed]}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.composerScroll}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Give it a title"
            placeholderTextColor="#7F7579"
            returnKeyType="next"
            style={styles.titleInput}
            accessibilityLabel="Text title"
          />
          {attemptedSave && !title.trim() ? <Text style={styles.validationText}>A title helps you find this later.</Text> : null}

          <Text style={styles.inputLabel}>LANGUAGE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.languagePicker}>
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = language === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    feedback.select();
                    setLanguage(option);
                  }}
                  style={({ pressed }) => [styles.languageOption, isSelected && styles.languageOptionSelected, pressed && styles.iconPressed]}
                >
                  <Text style={[styles.languageOptionText, isSelected && styles.languageOptionTextSelected]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.bodyInputWrap}>
            <Text style={styles.inputLabel}>WORDS</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write, paste, or hold on to a thought…"
              placeholderTextColor="#7F7579"
              multiline
              textAlignVertical="top"
              style={styles.bodyInput}
              accessibilityLabel="Text body"
            />
          </View>
          {attemptedSave && !body.trim() ? <Text style={styles.validationText}>Add the words you want to keep.</Text> : null}

          <View style={styles.localOnlyNote}>
            <MaterialIcons name="offline-pin" size={18} color="#FFBF68" />
            <Text style={styles.localOnlyText}>Saved privately on this device. No connection is needed.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface ManageSheetProps {
  text: SavedText | null;
  onDismiss: () => void;
  onEdit: () => void;
}

function ManageSheet({ text, onDismiss, onEdit }: ManageSheetProps) {
  const { deleteText } = useSwarLipi();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setConfirmDelete(false), [text]);
  if (!text) return null;

  function remove() {
    if (!text) return;
    if (!confirmDelete) {
      feedback.destructive();
      setConfirmDelete(true);
      return;
    }
    deleteText(text.id);
    feedback.confirm();
    onDismiss();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(180)} style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          <Text numberOfLines={1} style={styles.sheetTitle}>{text.title}</Text>
          <Text style={styles.sheetSubhead}>Manage this saved text</Text>
          <Pressable
            onPress={() => {
              feedback.tap();
              onEdit();
            }}
            style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]}
          >
            <MaterialIcons name="edit" size={21} color="#FFF8F2" />
            <Text style={styles.sheetActionText}>Edit text</Text>
            <MaterialIcons name="chevron-right" size={21} color="#9C8E93" />
          </Pressable>
          <Pressable onPress={remove} style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]}>
            <MaterialIcons name="delete-outline" size={21} color="#FF8C92" />
            <Text style={[styles.sheetActionText, styles.deleteText]}>{confirmDelete ? "Tap again to delete" : "Delete text"}</Text>
            <MaterialIcons name="chevron-right" size={21} color="#9C8E93" />
          </Pressable>
          <Pressable onPress={onDismiss} style={({ pressed }) => [styles.cancelSheetButton, pressed && styles.iconPressed]}>
            <Text style={styles.cancelSheetText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ArrangeSheetProps {
  visible: boolean;
  texts: SavedText[];
  onDismiss: () => void;
  onSave: (orderedIds: string[]) => void;
}

function ArrangeSheet({ visible, texts, onDismiss, onSave }: ArrangeSheetProps) {
  const [draftTexts, setDraftTexts] = useState(texts);

  useEffect(() => {
    if (visible) setDraftTexts(texts);
  }, [texts, visible]);

  function saveArrangement() {
    onSave(draftTexts.map((text) => text.id));
    feedback.confirm();
    onDismiss();
  }

  function moveText(id: string, direction: -1 | 1) {
    setDraftTexts((current) => {
      const index = current.findIndex((text) => text.id === id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    feedback.select();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <StatusBar style="light" />
      <View style={styles.arrangeRoot}>
        <View style={styles.arrangeHeader}>
          <Pressable onPress={onDismiss} hitSlop={12} style={({ pressed }) => [styles.roundIcon, pressed && styles.iconPressed]}>
            <MaterialIcons name="close" size={22} color="#FFF8F2" />
          </Pressable>
          <View style={styles.arrangeHeaderCopy}>
            <Text style={styles.composerEyebrow}>YOUR LIBRARY, YOUR ORDER</Text>
            <Text style={styles.arrangeTitle}>Arrange texts</Text>
          </View>
          <Pressable onPress={saveArrangement} style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}>
            <Text style={styles.saveButtonText}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.arrangeCaption}>Use the arrows to move each text up or down. The new order is stored on this device when you tap Done.</Text>
        <FlatList
          data={draftTexts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.arrangeList}
          renderItem={({ item, index }) => {
            const accent = documentAccent(item.language);
            return (
              <View style={styles.arrangeCard}>
                <Text style={styles.arrangePosition}>{index + 1}</Text>
                <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.arrangeAccent}>
                  <Text style={styles.arrangeInitial}>{item.title.trim().slice(0, 1) || "•"}</Text>
                </LinearGradient>
                <View style={styles.arrangeCardCopy}>
                  <Text numberOfLines={1} style={styles.arrangeCardTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={styles.arrangeCardMeta}>{item.language} · {formatPreview(item.body)}</Text>
                </View>
                <View style={styles.arrangeMoveColumn}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.title} up`}
                    disabled={index === 0}
                    onPress={() => moveText(item.id, -1)}
                    style={({ pressed }) => [styles.arrangeMoveButton, index === 0 && styles.arrangeMoveButtonDisabled, pressed && index > 0 && styles.iconPressed]}
                  >
                    <MaterialIcons name="keyboard-arrow-up" size={23} color={index === 0 ? "#6E6168" : "#F9D0A3"} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.title} down`}
                    disabled={index === draftTexts.length - 1}
                    onPress={() => moveText(item.id, 1)}
                    style={({ pressed }) => [styles.arrangeMoveButton, index === draftTexts.length - 1 && styles.arrangeMoveButtonDisabled, pressed && index < draftTexts.length - 1 && styles.iconPressed]}
                  >
                    <MaterialIcons name="keyboard-arrow-down" size={23} color={index === draftTexts.length - 1 ? "#6E6168" : "#F9D0A3"} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

interface SettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

function SettingsSheet({ visible, onDismiss }: SettingsSheetProps) {
  const { preferences, setPreferences } = useSwarLipi();
  const smaller = () => setPreferences({ fontScale: clamp(Number((preferences.fontScale - 0.1).toFixed(2)), 0.9, 1.2) });
  const larger = () => setPreferences({ fontScale: clamp(Number((preferences.fontScale + 0.1).toFixed(2)), 0.9, 1.2) });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(180)} style={styles.settingsSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.settingsHeading}>Your reading space</Text>
          <Text style={styles.settingsCaption}>A few quiet preferences, stored locally with your library.</Text>
          <View style={styles.settingsRow}>
            <View>
              <Text style={styles.settingsRowTitle}>Reading size</Text>
              <Text style={styles.settingsRowDetail}>Adjust the reader type to your comfort.</Text>
            </View>
            <View style={styles.fontAdjuster}>
              <Pressable onPress={smaller} style={({ pressed }) => [styles.fontStep, pressed && styles.iconPressed]}><Text style={styles.fontStepText}>A−</Text></Pressable>
              <Text style={styles.fontPercent}>{Math.round(preferences.fontScale * 100)}%</Text>
              <Pressable onPress={larger} style={({ pressed }) => [styles.fontStep, pressed && styles.iconPressed]}><Text style={styles.fontStepText}>A+</Text></Pressable>
            </View>
          </View>
          <View style={styles.backupCard}>
            <MaterialIcons name="cloud-done" size={21} color="#FFBE69" />
            <View style={styles.backupCopy}>
              <Text style={styles.backupTitle}>Device backup support</Text>
              <Text style={styles.backupText}>Your library is saved on this device immediately. Android automatic backup is enabled for eligible app data; restoration after reinstall depends on your device backup settings.</Text>
            </View>
          </View>
          <Pressable onPress={onDismiss} style={({ pressed }) => [styles.doneSettingsButton, pressed && styles.iconPressed]}>
            <Text style={styles.doneSettingsText}>Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ReaderOverlayProps {
  text: SavedText;
  onClose: (progress: number) => void;
}

function ReaderOverlay({ text, onClose }: ReaderOverlayProps) {
  const { annotations, addAnnotation, preferences, setPreferences } = useSwarLipi();
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const offsetRef = useRef(0);
  const progressRef = useRef(text.lastReadOffset);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(text.lastReadOffset);
  const [scrollRate, setScrollRate] = useState(preferences.scrollRate);
  const [metrics, setMetrics] = useState({ content: 1, viewport: 1 });
  const [notesOpen, setNotesOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const readerNotes = useMemo(() => annotations.filter((annotation) => annotation.textId === text.id), [annotations, text.id]);
  const maxOffset = getReaderMaxOffset(metrics.content, metrics.viewport);
  const accent = documentAccent(text.language);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!playing || maxOffset <= 0) return;
    let frame = 0;
    let previous = 0;
    let active = true;

    const tick = (time: number) => {
      if (!active || !mountedRef.current) return;
      if (!previous) previous = time;
      const delta = Math.min(40, time - previous);
      previous = time;
      const next = Math.min(maxOffset, offsetRef.current + (scrollRate * delta) / 1000);
      offsetRef.current = next;
      const nextProgress = getReaderProgress(next, maxOffset);
      progressRef.current = nextProgress;
      if (mountedRef.current) setProgress(nextProgress);
      if (mountedRef.current) scrollRef.current?.scrollTo({ y: next, animated: false });

      if (next >= maxOffset - 0.5) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [maxOffset, playing, scrollRate]);

  const seek = useCallback((nextProgress: number) => {
    const nextOffset = getReaderOffset(nextProgress, maxOffset);
    const safeProgress = getReaderProgress(nextOffset, maxOffset);
    offsetRef.current = nextOffset;
    progressRef.current = safeProgress;
    setProgress(safeProgress);
    scrollRef.current?.scrollTo({ y: nextOffset, animated: false });
  }, [maxOffset]);

  function updateSpeed(value: number, persist = false) {
    const next = getReaderScrollRate(value, SPEED_MIN, SPEED_MAX);
    setScrollRate(next);
    if (persist) {
      setPreferences({ scrollRate: next });
      feedback.select();
    }
  }

  function close() {
    setPlaying(false);
    feedback.tap();
    onClose(progressRef.current);
  }

  function saveNote() {
    if (!newNote.trim()) {
      feedback.error();
      return;
    }
    addAnnotation(text.id, newNote, progressRef.current);
    setNewNote("");
    setNotesOpen(false);
    feedback.confirm();
  }

  const readerSize = 22 * preferences.fontScale;
  const readerLineHeight = 35 * preferences.fontScale;
  const speedProgress = (scrollRate - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);

  return (
    <View style={styles.readerRoot}>
      <LinearGradient colors={["#4B0714", "#861A28", "#301019", "#101014"]} locations={[0, 0.45, 0.78, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.readerGlowOne} />
      <View style={styles.readerGlowTwo} />
      <View style={styles.readerHeader}>
        <Pressable onPress={close} hitSlop={12} style={({ pressed }) => [styles.readerBackButton, pressed && styles.iconPressed]}>
          <MaterialIcons name="keyboard-arrow-down" size={35} color="#FFF8F2" />
        </Pressable>
        <View style={styles.readerHeaderTitle}>
          <Text numberOfLines={1} style={styles.readerDocumentTitle}>{text.title}</Text>
          <Text style={styles.readerLanguage}>{text.language.toUpperCase()} · PRIVATE LIBRARY</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open annotations"
          onPress={() => {
            feedback.tap();
            setNotesOpen(true);
          }}
          style={({ pressed }) => [styles.readerNotesButton, pressed && styles.iconPressed]}
        >
          <MaterialIcons name="notes" size={21} color="#FFF8F2" />
          {readerNotes.length ? <View style={styles.readerNoteBadge}><Text style={styles.readerNoteBadgeText}>{readerNotes.length}</Text></View> : null}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.readerScroll}
        contentContainerStyle={styles.readerScrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(event) => {
          if (mountedRef.current) setMetrics((current) => ({ ...current, viewport: event.nativeEvent.layout.height }));
        }}
        onContentSizeChange={(_, height) => {
          if (mountedRef.current) setMetrics((current) => ({ ...current, content: height }));
        }}
        onScroll={(event) => {
          if (playing) return;
          const nextOffset = event.nativeEvent.contentOffset.y;
          offsetRef.current = nextOffset;
          const nextProgress = getReaderProgress(nextOffset, maxOffset);
          progressRef.current = nextProgress;
          if (mountedRef.current) setProgress(nextProgress);
        }}
      >
        <View style={styles.readerTextBlock}>
          <View style={styles.readerLanguageTag}><Text style={styles.readerLanguageTagText}>{text.language}</Text></View>
          <Text style={[styles.readerBody, { fontSize: readerSize, lineHeight: readerLineHeight }]}>{text.body}</Text>
          <View style={styles.readerEndMark}>
            <View style={styles.readerEndLine} />
            <MaterialIcons name="auto-awesome" size={16} color="#F4B667" />
            <View style={styles.readerEndLine} />
          </View>
          <Text style={styles.readerEndText}>Saved in SwarLipi</Text>
        </View>
      </ScrollView>

      <View style={styles.readerControls}>
        <LinearGradient pointerEvents="none" colors={["rgba(18,9,14,0)", "rgba(20,9,14,0.30)", "rgba(15,7,11,0.66)"]} locations={[0, 0.24, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.readerControlTopline}>
          <Pressable
            onPress={() => {
              feedback.tap();
              setNotesOpen(true);
            }}
            style={({ pressed }) => [styles.readerAuxButton, pressed && styles.iconPressed]}
          >
            <MaterialIcons name="mode-comment" size={20} color="#FFF8F2" />
            <Text style={styles.readerAuxText}>{readerNotes.length ? `${readerNotes.length} notes` : "Add note"}</Text>
          </Pressable>
          <Text style={styles.readerPercent}>{Math.round(progress * 100)}% read</Text>
        </View>
        <ReaderSlider accessibilityLabel="Reading progress" value={progress} onSlidingStart={() => setPlaying(false)} onValueChange={seek}>
          <View pointerEvents="none" style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 1.5)}%` }]} />
            <View style={[styles.progressThumb, { left: `${Math.max(progress * 100, 1.5)}%` }]} />
          </View>
        </ReaderSlider>
        <View style={styles.speedRow}>
          <View style={styles.speedLabelWrap}>
            <MaterialIcons name="speed" size={19} color="#F5C27D" />
            <Text style={styles.speedLabel}>SCROLLING SPEED</Text>
          </View>
          <Text style={styles.speedValue}>{scrollRate} px/s</Text>
        </View>
        <ReaderSlider accessibilityLabel="Scrolling speed" value={speedProgress} onValueChange={(value) => updateSpeed(value)} onSlidingComplete={(value) => updateSpeed(value, true)}>
          <View pointerEvents="none" style={styles.speedTrack}>
            <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.speedFill, { width: `${Math.max(speedProgress * 100, 4)}%` }]} />
            <View style={[styles.speedThumb, { left: `${Math.max(speedProgress * 100, 4)}%` }]} />
          </View>
        </ReaderSlider>
        <View style={styles.speedEnds}><Text style={styles.speedEndText}>SLOW</Text><Text style={styles.speedEndText}>FAST</Text></View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause automatic scrolling" : "Start automatic scrolling"}
          onPress={() => {
            feedback.tap();
            setPlaying((current) => !current);
          }}
          style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        >
          <MaterialIcons name={playing ? "pause" : "play-arrow"} size={43} color="#161014" />
        </Pressable>
      </View>

      {notesOpen ? (
        <View style={styles.inlineSheetLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotesOpen(false)} />
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(150)} style={styles.notesSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.notesTitleRow}>
              <View><Text style={styles.notesTitle}>Notes in this text</Text><Text style={styles.notesCaption}>Anchor a thought to where you are reading.</Text></View>
              <Pressable onPress={() => setNotesOpen(false)} hitSlop={8}><MaterialIcons name="close" size={22} color="#FFF8F2" /></Pressable>
            </View>
            <View style={styles.noteComposer}>
              <TextInput value={newNote} onChangeText={setNewNote} placeholder="Write a note…" placeholderTextColor="#897B80" multiline style={styles.noteInput} />
              <Pressable onPress={saveNote} style={({ pressed }) => [styles.noteSaveButton, pressed && styles.iconPressed]}><MaterialIcons name="arrow-upward" size={19} color="#271117" /></Pressable>
            </View>
            <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false}>
              {readerNotes.length ? readerNotes.map((annotation) => (
                <View key={annotation.id} style={styles.noteItem}>
                  <View style={styles.noteMarker} />
                  <View style={styles.noteCopy}><Text style={styles.noteMeta}>{annotationLabel(annotation)}</Text><Text style={styles.noteBody}>{annotation.body}</Text></View>
                </View>
              )) : <Text style={styles.emptyNotes}>No notes yet. Add a thought at your current place in the text.</Text>}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function LibraryScreen() {
  const { texts, annotations, hydrated, updateText, reorderTexts } = useSwarLipi();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingText, setEditingText] = useState<SavedText | null>(null);
  const [managedText, setManagedText] = useState<SavedText | null>(null);
  const [activeText, setActiveText] = useState<SavedText | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const filteredTexts = useMemo<SavedText[]>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return texts.filter((text: SavedText) => {
      const matchesLanguage = filter === ALL_FILTER || text.language === filter;
      const haystack = `${text.title} ${text.body} ${text.language}`.toLocaleLowerCase();
      return matchesLanguage && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query, texts]);

  const languageCount = new Set(texts.map((text: SavedText) => text.language)).size;
  const annotationCounts = useMemo(() => {
    return annotations.reduce<Record<string, number>>((counts: Record<string, number>, annotation: Annotation) => {
      counts[annotation.textId] = (counts[annotation.textId] ?? 0) + 1;
      return counts;
    }, {});
  }, [annotations]);

  const openComposer = (text: SavedText | null = null) => {
    setEditingText(text);
    setComposerOpen(true);
  };

  const openManagedEdit = () => {
    const selected = managedText;
    setManagedText(null);
    if (selected) openComposer(selected);
  };

  const closeReader = useCallback((lastReadOffset: number) => {
    const current = activeText;
    setActiveText(null);
    if (current) updateText(current.id, { lastReadOffset: clamp(lastReadOffset, 0, 1) });
  }, [activeText, updateText]);

  if (!hydrated) {
    return (
      <ScreenContainer className="items-center justify-center" containerClassName="bg-background">
        <StatusBar style="light" />
        <Animated.View entering={FadeIn.duration(260)} style={styles.loadingWrap}>
          <LinearGradient colors={["#FFBE69", "#E66085"]} style={styles.loadingOrb}><MaterialIcons name="menu-book" size={28} color="#191015" /></LinearGradient>
          <Text style={styles.loadingTitle}>Opening your library</Text>
          <Text style={styles.loadingCaption}>Your saved words stay close.</Text>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <StatusBar style="light" />
      <FlatList
        data={filteredTexts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View style={styles.brandLockup}><View style={styles.brandMark}><MaterialIcons name="menu-book" size={22} color="#1B1015" /></View><Text style={styles.brandText}>SwarLipi</Text></View>
              <Pressable accessibilityLabel="Open preferences" onPress={() => { feedback.tap(); setSettingsOpen(true); }} style={({ pressed }) => [styles.roundIcon, pressed && styles.iconPressed]}><MaterialIcons name="settings" size={22} color="#FFF8F2" /></Pressable>
            </View>
            <LinearGradient colors={["#481225", "#7B2337", "#A54A42"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroDotOne} /><View style={styles.heroDotTwo} />
              <Text style={styles.heroEyebrow}>YOUR PRIVATE WORDS, IN MOTION</Text>
              <Text style={styles.heroTitle}>A beautiful place{`\n`}to return to.</Text>
              <Text style={styles.heroCopy}>Read gently. Let the text move when you are ready.</Text>
              <View style={styles.heroStats}><View><Text style={styles.heroStatValue}>{texts.length}</Text><Text style={styles.heroStatLabel}>SAVED TEXTS</Text></View><View style={styles.heroStatDivider} /><View><Text style={styles.heroStatValue}>{languageCount}</Text><Text style={styles.heroStatLabel}>LANGUAGES</Text></View><View style={styles.heroStatDivider} /><View><Text style={styles.heroStatValue}>{annotations.length}</Text><Text style={styles.heroStatLabel}>NOTES</Text></View></View>
            </LinearGradient>
            <View style={styles.searchBox}><MaterialIcons name="search" size={21} color="#A99A9E" /><TextInput value={query} onChangeText={setQuery} placeholder="Search your words" placeholderTextColor="#877A7E" style={styles.searchInput} returnKeyType="search" accessibilityLabel="Search saved texts" />{query ? <Pressable onPress={() => setQuery("")} hitSlop={8}><MaterialIcons name="close" size={18} color="#A99A9E" /></Pressable> : null}</View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[ALL_FILTER, ...LANGUAGE_OPTIONS].map((option) => {
                const selected = filter === option;
                return <Pressable key={option} onPress={() => { feedback.select(); setFilter(option); }} style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.iconPressed]}><Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{option}</Text></Pressable>;
              })}
            </ScrollView>
            <View style={styles.collectionHeading}><View><Text style={styles.collectionTitle}>{filter === ALL_FILTER ? "Your library" : filter}</Text><Text style={styles.collectionCaption}>{filteredTexts.length} text{filteredTexts.length === 1 ? "" : "s"} ready to read</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Arrange texts" onPress={() => { feedback.tap(); setArrangeOpen(true); }} hitSlop={10} style={({ pressed }) => [styles.arrangeButton, pressed && styles.iconPressed]}><MaterialIcons name="drag-handle" size={24} color="#F8CCA0" /></Pressable></View>
          </View>
        }
        renderItem={({ item, index }) => <DocumentCard item={item} index={index} annotationCount={annotationCounts[item.id] ?? 0} onOpen={() => setActiveText(item)} onManage={() => setManagedText(item)} />}
        ListEmptyComponent={<View style={styles.emptyLibrary}><LinearGradient colors={["#512037", "#2E1A27"]} style={styles.emptyIcon}><MaterialIcons name="auto-stories" size={30} color="#FFC370" /></LinearGradient><Text style={styles.emptyTitle}>No matching words yet</Text><Text style={styles.emptyCopy}>Try another search, or save a new text to begin.</Text></View>}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Save a new text" onPress={() => { feedback.tap(); openComposer(); }} style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}><MaterialIcons name="add" size={28} color="#281116" /><Text style={styles.fabText}>New text</Text></Pressable>

      <ComposerSheet visible={composerOpen} editingText={editingText} onDismiss={() => { setComposerOpen(false); setEditingText(null); }} />
      <ManageSheet text={managedText} onDismiss={() => setManagedText(null)} onEdit={openManagedEdit} />
      <SettingsSheet visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
      <ArrangeSheet visible={arrangeOpen} texts={texts} onDismiss={() => setArrangeOpen(false)} onSave={reorderTexts} />
      {activeText ? <ReaderOverlay text={activeText} onClose={closeReader} /> : null}
    </ScreenContainer>
  );
}

export default function HomeScreen() {
  return <LibraryScreen />;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 18 },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 37, height: 37, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#FFBD6A" },
  brandText: { color: "#FFF8F2", fontSize: 22, fontWeight: "800", letterSpacing: -0.7 },
  roundIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#211921", borderWidth: 1, borderColor: "#3C3038" },
  heroCard: { borderRadius: 28, minHeight: 238, padding: 24, overflow: "hidden", marginBottom: 18 },
  heroDotOne: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,193,112,0.18)", top: -61, right: -39 },
  heroDotTwo: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,244,222,0.10)", bottom: -55, left: 112 },
  heroEyebrow: { color: "#FFD7A8", fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginBottom: 12 },
  heroTitle: { color: "#FFF9F3", fontSize: 30, lineHeight: 35, fontWeight: "800", letterSpacing: -1.1 },
  heroCopy: { color: "#F6D4CC", fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 260 },
  heroStats: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  heroStatValue: { color: "#FFF8F2", fontSize: 18, fontWeight: "800" },
  heroStatLabel: { color: "#F2C9BD", fontSize: 8, fontWeight: "800", letterSpacing: 0.9, marginTop: 2 },
  heroStatDivider: { height: 27, width: 1, backgroundColor: "rgba(255,242,230,0.25)" },
  searchBox: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: "#342B34", backgroundColor: "#1A161D", flexDirection: "row", alignItems: "center", paddingHorizontal: 15, gap: 10, marginBottom: 14 },
  searchInput: { flex: 1, color: "#FFF8F2", fontSize: 15, paddingVertical: 0 },
  filterRow: { gap: 8, paddingBottom: 24, paddingRight: 20 },
  filterChip: { borderRadius: 20, paddingHorizontal: 15, height: 35, alignItems: "center", justifyContent: "center", backgroundColor: "#211A21", borderWidth: 1, borderColor: "#352A34" },
  filterChipSelected: { backgroundColor: "#FFBC67", borderColor: "#FFBC67" },
  filterChipText: { color: "#C9B8BC", fontSize: 13, fontWeight: "700" },
  filterChipTextSelected: { color: "#2D1419" },
  collectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  collectionTitle: { color: "#FFF8F2", fontSize: 22, fontWeight: "800", letterSpacing: -0.6 },
  collectionCaption: { color: "#9F9095", fontSize: 12, marginTop: 2 },
  arrangeButton: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#272028", borderWidth: 1, borderColor: "#3E323C" },
  listContent: { paddingBottom: 112 },
  cardShell: { minHeight: 136, borderRadius: 22, backgroundColor: "#1B161D", borderWidth: 1, borderColor: "#312832", flexDirection: "row", alignItems: "center", padding: 13, marginBottom: 11, overflow: "hidden" },
  pressedCard: { transform: [{ scale: 0.985 }], opacity: 0.88 },
  cardAccent: { width: 62, height: 104, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardInitial: { color: "#FFF8F2", fontSize: 28, fontWeight: "800" },
  cardCopy: { flex: 1, marginLeft: 14, paddingRight: 4 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  languageLabel: { color: "#FFBF70", fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  metaDot: { color: "#74666D", fontSize: 10 },
  updatedLabel: { color: "#93858B", fontSize: 10, fontWeight: "600" },
  cardTitle: { color: "#FFF8F2", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  cardPreview: { color: "#B8A8AD", fontSize: 12, lineHeight: 17, marginTop: 4 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  annotationPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  annotationPillText: { color: "#B9A7AC", fontSize: 10, fontWeight: "700" },
  resumeLabel: { color: "#ECAF64", fontSize: 10, fontWeight: "700" },
  cardMore: { width: 30, height: 42, justifyContent: "center", alignItems: "center" },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  fab: { position: "absolute", right: 20, bottom: 20, height: 55, paddingHorizontal: 19, borderRadius: 28, backgroundColor: "#FFC071", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  fabPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  fabText: { color: "#261116", fontSize: 14, fontWeight: "800" },
  emptyLibrary: { alignItems: "center", paddingTop: 60, paddingHorizontal: 38 },
  emptyIcon: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: "#FFF8F2", fontSize: 19, fontWeight: "800" },
  emptyCopy: { color: "#9E9095", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7 },
  loadingWrap: { alignItems: "center" },
  loadingOrb: { width: 64, height: 64, borderRadius: 24, justifyContent: "center", alignItems: "center", marginBottom: 17 },
  loadingTitle: { color: "#FFF8F2", fontSize: 20, fontWeight: "800" },
  loadingCaption: { color: "#A8969C", fontSize: 13, marginTop: 5 },
  composerRoot: { flex: 1, backgroundColor: "#141116" },
  composerHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 28 : 16, paddingBottom: 17, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#2E2630", gap: 12 },
  composerTitleWrap: { flex: 1 },
  composerEyebrow: { color: "#F7BD71", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  composerTitle: { color: "#FFF8F2", fontSize: 19, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  saveButton: { height: 39, paddingHorizontal: 15, borderRadius: 15, backgroundColor: "#FFC071", alignItems: "center", justifyContent: "center" },
  saveButtonPressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  saveButtonText: { color: "#2C1419", fontSize: 13, fontWeight: "800" },
  composerScroll: { padding: 22, paddingBottom: 44 },
  titleInput: { color: "#FFF8F2", fontSize: 29, fontWeight: "800", letterSpacing: -0.7, paddingHorizontal: 0, paddingVertical: 4, marginBottom: 25 },
  validationText: { color: "#FF9CA2", fontSize: 12, marginTop: -16, marginBottom: 18 },
  inputLabel: { color: "#B5A2A9", fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginBottom: 11 },
  languagePicker: { gap: 8, paddingRight: 20, marginBottom: 27 },
  languageOption: { height: 37, borderRadius: 18, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#38303A", backgroundColor: "#1F1920" },
  languageOptionSelected: { borderColor: "#FFBF70", backgroundColor: "#523024" },
  languageOptionText: { color: "#B9AAB0", fontSize: 13, fontWeight: "700" },
  languageOptionTextSelected: { color: "#FFCA8A" },
  bodyInputWrap: { minHeight: 300, borderRadius: 22, borderWidth: 1, borderColor: "#342B34", backgroundColor: "#1A161C", padding: 17 },
  bodyInput: { color: "#FFF8F2", fontSize: 18, lineHeight: 29, minHeight: 245, padding: 0 },
  localOnlyNote: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 16, backgroundColor: "#211B20", padding: 14, marginTop: 20 },
  localOnlyText: { color: "#BAA9AD", flex: 1, fontSize: 12, lineHeight: 17 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.64)" },
  actionSheet: { backgroundColor: "#21171D", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 21, paddingTop: 11, paddingBottom: 30 },
  sheetHandle: { width: 42, height: 4, borderRadius: 4, backgroundColor: "#6B5B61", alignSelf: "center", marginBottom: 19 },
  sheetTitle: { color: "#FFF8F2", fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  sheetSubhead: { color: "#9F9096", fontSize: 13, marginTop: 4, marginBottom: 18 },
  sheetAction: { flexDirection: "row", alignItems: "center", paddingVertical: 17, borderTopWidth: 1, borderTopColor: "#3A2D35", gap: 13 },
  sheetActionPressed: { opacity: 0.68 },
  sheetActionText: { color: "#FFF8F2", fontSize: 16, fontWeight: "700", flex: 1 },
  deleteText: { color: "#FF9CA0" },
  cancelSheetButton: { height: 49, borderRadius: 16, backgroundColor: "#33262E", alignItems: "center", justifyContent: "center", marginTop: 14 },
  cancelSheetText: { color: "#E7D8D4", fontSize: 15, fontWeight: "800" },
  settingsSheet: { backgroundColor: "#21171D", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 21, paddingTop: 11, paddingBottom: 31 },
  settingsHeading: { color: "#FFF8F2", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  settingsCaption: { color: "#A9979D", fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 22 },
  settingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 15, borderTopWidth: 1, borderTopColor: "#3A2D35" },
  settingsRowTitle: { color: "#FFF8F2", fontSize: 15, fontWeight: "700" },
  settingsRowDetail: { color: "#9F9096", fontSize: 12, marginTop: 3, maxWidth: 190 },
  fontAdjuster: { flexDirection: "row", alignItems: "center", gap: 8 },
  fontStep: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "#382A32", borderRadius: 12 },
  fontStepText: { color: "#FFE6C4", fontSize: 12, fontWeight: "800" },
  fontPercent: { color: "#F6C37D", fontSize: 12, fontWeight: "800", width: 33, textAlign: "center" },
  backupCard: { flexDirection: "row", gap: 12, borderRadius: 18, padding: 15, backgroundColor: "#2B2430", marginTop: 17 },
  backupCopy: { flex: 1 },
  backupTitle: { color: "#FFE2B4", fontSize: 13, fontWeight: "800" },
  backupText: { color: "#C1B0B4", fontSize: 12, lineHeight: 17, marginTop: 4 },
  doneSettingsButton: { height: 49, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FFC071", marginTop: 20 },
  doneSettingsText: { color: "#291319", fontSize: 15, fontWeight: "800" },
  readerRoot: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: "#1A0C13", overflow: "hidden" },
  readerGlowOne: { position: "absolute", width: 330, height: 330, borderRadius: 165, backgroundColor: "rgba(229,79,87,0.18)", top: 125, right: -205 },
  readerGlowTwo: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(250,168,80,0.12)", bottom: 105, left: -150 },
  readerHeader: { paddingTop: Platform.OS === "android" ? 30 : 15, paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(26,8,14,0.42)" },
  readerBackButton: { width: 43, height: 43, justifyContent: "center", alignItems: "center", marginLeft: -9 },
  readerHeaderTitle: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  readerDocumentTitle: { color: "#FFF9F3", fontSize: 17, fontWeight: "800", maxWidth: 210 },
  readerLanguage: { color: "#E7C6B5", fontSize: 9, letterSpacing: 1, fontWeight: "800", marginTop: 4 },
  readerNotesButton: { width: 43, height: 43, alignItems: "center", justifyContent: "center", position: "relative" },
  readerNoteBadge: { position: "absolute", top: 3, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFBE69", justifyContent: "center", alignItems: "center" },
  readerNoteBadgeText: { color: "#38131B", fontSize: 9, fontWeight: "900" },
  readerScroll: { flex: 1 },
  readerScrollContent: { paddingHorizontal: 30, paddingTop: 31, paddingBottom: 304 },
  readerTextBlock: { paddingBottom: 38 },
  readerLanguageTag: { alignSelf: "flex-start", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(255,237,219,0.11)", marginBottom: 21 },
  readerLanguageTagText: { color: "#FFD2AD", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 },
  readerBody: { color: "#FFF2E8", fontWeight: "600", letterSpacing: -0.25 },
  readerEndMark: { marginTop: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  readerEndLine: { height: 1, width: 32, backgroundColor: "rgba(255,229,206,0.35)" },
  readerEndText: { color: "#E8C7B6", fontSize: 11, textAlign: "center", marginTop: 10, fontWeight: "700" },
  readerControls: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5, overflow: "hidden", paddingHorizontal: 25, paddingTop: 34, paddingBottom: Platform.OS === "android" ? 24 : 16, borderTopWidth: 1, borderTopColor: "rgba(255,217,190,0.10)" },
  readerControlTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  readerAuxButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  readerAuxText: { color: "#FFF1E8", fontSize: 12, fontWeight: "700" },
  readerPercent: { color: "#D6B7AA", fontSize: 11, fontWeight: "700" },
  readerSliderTouch: { height: 36, justifyContent: "center" },
  progressTrack: { height: 5, borderRadius: 6, backgroundColor: "rgba(255,231,214,0.31)", justifyContent: "center" },
  progressFill: { height: 5, borderRadius: 6, backgroundColor: "#FFF3E9" },
  progressThumb: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#FFF9F3", marginLeft: -6.5, shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  speedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17, marginBottom: 9 },
  speedLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  speedLabel: { color: "#EACFC0", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 },
  speedValue: { color: "#FFC676", fontSize: 11, fontWeight: "800" },
  speedTrack: { height: 7, borderRadius: 7, backgroundColor: "rgba(255,233,215,0.27)", justifyContent: "center" },
  speedFill: { height: 7, borderRadius: 7 },
  speedThumb: { position: "absolute", width: 15, height: 15, borderRadius: 8, backgroundColor: "#FFF8F2", marginLeft: -7.5, borderWidth: 2, borderColor: "#52232A" },
  speedEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  speedEndText: { color: "#A98E85", fontSize: 8, fontWeight: "800", letterSpacing: 0.9 },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFF9F3", alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 13, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  playButtonPressed: { transform: [{ scale: 0.96 }], opacity: 0.94 },
  inlineSheetLayer: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  notesSheet: { maxHeight: WINDOW_HEIGHT * 0.61, backgroundColor: "#261820", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "android" ? 24 : 16 },
  notesTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 15 },
  notesTitle: { color: "#FFF8F2", fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  notesCaption: { color: "#AA979E", fontSize: 12, marginTop: 3 },
  noteComposer: { minHeight: 55, borderRadius: 18, paddingLeft: 14, paddingRight: 7, backgroundColor: "#37272F", flexDirection: "row", alignItems: "center", gap: 8 },
  noteInput: { color: "#FFF8F2", fontSize: 14, flex: 1, maxHeight: 85, paddingVertical: 10 },
  noteSaveButton: { width: 39, height: 39, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFC071" },
  notesList: { marginTop: 12 },
  noteItem: { flexDirection: "row", gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#3D2B34" },
  noteMarker: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F0AA64", marginTop: 6 },
  noteCopy: { flex: 1 },
  noteMeta: { color: "#EAB779", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  noteBody: { color: "#F6E7E0", fontSize: 14, lineHeight: 19, marginTop: 4 },
  emptyNotes: { color: "#AA979E", fontSize: 13, lineHeight: 19, textAlign: "center", paddingVertical: 27, paddingHorizontal: 30 },
  arrangeRoot: { flex: 1, backgroundColor: "#151116", paddingHorizontal: 20 },
  arrangeHeader: { paddingTop: Platform.OS === "android" ? 31 : 16, paddingBottom: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#302630" },
  arrangeHeaderCopy: { flex: 1 },
  arrangeTitle: { color: "#FFF8F2", fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  arrangeCaption: { color: "#A9999E", fontSize: 13, lineHeight: 19, marginTop: 17, marginBottom: 11, paddingRight: 12 },
  arrangeList: { paddingTop: 4, paddingBottom: 28 },
  arrangeCard: { minHeight: 82, borderRadius: 19, backgroundColor: "#211A22", borderWidth: 1, borderColor: "#382D37", flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 10 },
  arrangeCardActive: { backgroundColor: "#362331", borderColor: "#FFB86A", transform: [{ scale: 1.015 }], shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  arrangePosition: { color: "#A8959C", fontSize: 11, fontWeight: "800", width: 19, textAlign: "center" },
  arrangeAccent: { width: 43, height: 61, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  arrangeInitial: { color: "#FFF8F2", fontSize: 21, fontWeight: "900" },
  arrangeCardCopy: { flex: 1, marginLeft: 12, paddingRight: 6 },
  arrangeCardTitle: { color: "#FFF8F2", fontSize: 15, fontWeight: "800" },
  arrangeCardMeta: { color: "#B4A2AA", fontSize: 11, marginTop: 5 },
  arrangeMoveColumn: { width: 43, alignItems: "center", gap: 3 },
  arrangeMoveButton: { width: 39, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#2D232C" },
  arrangeMoveButtonDisabled: { backgroundColor: "#252027", opacity: 0.64 },
});
