import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { feedback } from "@/lib/haptics";
import { fetchEncryptedLibrary, githubAppInstallUrl, openGitHubAppInstallation, uploadEncryptedLibrary } from "@/lib/github-account";
import { useGitHubAccount } from "@/lib/github-account-store";
import { createEncryptedLibraryBackup, decryptEncryptedLibraryBackup, downloadEncryptedBackup } from "@/lib/github-backup";
import { getReaderMaxOffset, getReaderOffset, getReaderProgress, getReaderScrollRate, getReaderSliderRatio } from "@/lib/reader-safety";
import { useSwarLipi } from "@/lib/swarlipi-store";
import { Annotation, clamp, LANGUAGE_OPTIONS, LibraryState, SavedText, TextLanguage } from "@/lib/swarlipi-storage";

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

function WebLibraryPanel({ textCount, annotationCount, wide }: { textCount: number; annotationCount: number; wide: boolean }) {
  if (Platform.OS !== "web") return null;
  const { session } = useGitHubAccount();

  return (
    <View style={[styles.webLibraryPanel, wide ? styles.webLibraryPanelWide : styles.webLibraryPanelNarrow]}>
      <View style={styles.webPanelHalo} />
      <View style={styles.webPanelEyebrowRow}>
        <View style={styles.webPanelStatusDot} />
        <Text style={styles.webPanelEyebrow}>YOUR PRIVATE SPACE</Text>
      </View>
      <Text style={styles.webPanelTitle}>{session ? `@${session.profile.login} is connected.` : "Your words stay yours."}</Text>
      <Text style={styles.webPanelCopy}>{session?.repository ? `Encrypted library sync is ready through ${session.repository}.` : session ? "Choose a private backup repository to connect this browser and your other devices." : "Saved in this browser first. Sign in with GitHub when you want an encrypted copy across your devices."}</Text>
      <View style={styles.webPanelDivider} />
      <View style={styles.webPanelMetrics}>
        <View style={styles.webPanelMetric}><MaterialIcons name="auto-stories" size={17} color="#F7BD71" /><Text style={styles.webPanelMetricValue}>{textCount}</Text><Text style={styles.webPanelMetricLabel}>TEXTS</Text></View>
        <View style={styles.webPanelMetric}><MaterialIcons name="mode-comment" size={17} color="#A8B2F6" /><Text style={styles.webPanelMetricValue}>{annotationCount}</Text><Text style={styles.webPanelMetricLabel}>NOTES</Text></View>
        <View style={styles.webPanelMetric}><MaterialIcons name={session?.repository ? "sync-lock" : "lock-outline"} size={17} color="#9DE4D7" /><Text style={styles.webPanelMetricValue}>{session?.repository ? "READY" : "LOCAL"}</Text><Text style={styles.webPanelMetricLabel}>{session?.repository ? "ENCRYPTED SYNC" : "BROWSER SAVE"}</Text></View>
      </View>
      <View style={styles.webPanelFooter}><MaterialIcons name="verified-user" size={16} color="#9DE4D7" /><Text style={styles.webPanelFooterText}>Private by default. No ads. No public feed.</Text></View>
    </View>
  );
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
            <Text style={styles.localOnlyText}>{Platform.OS === "web" ? "Saved privately in this browser. You can add an encrypted private GitHub backup whenever you are ready." : "Saved privately on this device. No connection is needed."}</Text>
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
  onOpenBackup: () => void;
}

function SettingsSheet({ visible, onDismiss, onOpenBackup }: SettingsSheetProps) {
  const { preferences, setPreferences } = useSwarLipi();
  const { accountHydrated, logout, session } = useGitHubAccount();
  const [accountMessage, setAccountMessage] = useState("");
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
          <Pressable onPress={onOpenBackup} style={({ pressed }) => [styles.accountCard, pressed && styles.backupCardPressed]}>
            <View style={styles.accountMark}><MaterialIcons name="account-circle" size={22} color="#171117" /></View>
            <View style={styles.backupCopy}>
              <Text style={styles.backupTitle}>{session ? `GitHub · @${session.profile.login}` : "GitHub encrypted sync"}</Text>
              <Text style={styles.backupText}>{accountHydrated ? session?.repository ? `Connected to ${session.repository}. Sync or restore your encrypted library.` : session ? "Signed in. Choose a private repository to connect Android and browser." : "Sign in with GitHub to keep an encrypted library copy in your own private repository." : "Checking your saved account…"}</Text>
            </View>
            {session ? <Pressable onPress={(event) => { event.stopPropagation(); void logout().then(() => setAccountMessage("Logged out on this device. Your encrypted repository copy remains yours.")); }} hitSlop={8} style={styles.accountLogout}><Text style={styles.accountLogoutText}>Log out</Text></Pressable> : <MaterialIcons name="chevron-right" size={21} color="#B9A6AB" />}
          </Pressable>
          {accountMessage ? <Text style={styles.settingsAccountStatus}>{accountMessage}</Text> : null}
          <Pressable onPress={onOpenBackup} style={({ pressed }) => [styles.backupCard, pressed && styles.backupCardPressed]}>
            <MaterialIcons name={Platform.OS === "web" ? "devices" : "cloud-done"} size={21} color="#FFBE69" />
            <View style={styles.backupCopy}>
              <Text style={styles.backupTitle}>Local library safety</Text>
              <Text style={styles.backupText}>{Platform.OS === "web" ? "This browser saves locally immediately. GitHub sync is optional and encrypted." : "This device saves locally immediately. Android automatic backup is enabled for eligible app data, but device backup settings control whether it restores after reinstall."}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={21} color="#B9A6AB" />
          </Pressable>
          <Pressable onPress={onDismiss} style={({ pressed }) => [styles.doneSettingsButton, pressed && styles.iconPressed]}>
            <Text style={styles.doneSettingsText}>Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

type BackupFeedbackKind = "progress" | "success" | "error";

interface BackupFeedback {
  kind: BackupFeedbackKind;
  title: string;
  detail: string;
}

function BackupFeedbackBanner({ notice }: { notice: BackupFeedback }) {
  const isProgress = notice.kind === "progress";
  const isSuccess = notice.kind === "success";

  return (
    <Animated.View entering={FadeInDown.duration(190)} style={[styles.backupFeedback, isProgress ? styles.backupFeedbackProgress : isSuccess ? styles.backupFeedbackSuccess : styles.backupFeedbackError]} accessibilityLiveRegion="polite">
      <View style={[styles.backupFeedbackIcon, isProgress ? styles.backupFeedbackIconProgress : isSuccess ? styles.backupFeedbackIconSuccess : styles.backupFeedbackIconError]}>
        {isProgress ? <ActivityIndicator size="small" color="#F6D5AB" /> : <MaterialIcons name={isSuccess ? "check" : "priority-high"} size={19} color={isSuccess ? "#14251F" : "#3A1519"} />}
      </View>
      <View style={styles.backupFeedbackCopy}>
        <Text style={[styles.backupFeedbackTitle, isProgress && styles.backupFeedbackTitleProgress]}>{notice.title}</Text>
        <Text style={styles.backupFeedbackDetail}>{notice.detail}</Text>
      </View>
    </Animated.View>
  );
}

function BackupSheet({ library, onDismiss, visible }: { library: LibraryState; onDismiss: () => void; visible: boolean }) {
  const { replaceLibrary } = useSwarLipi();
  const { chooseRepository, completeSignIn, deviceCode, logout, openSignInPage, session, startSignIn } = useGitHubAccount();
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [repository, setRepository] = useState("");
  const [backupFeedback, setBackupFeedback] = useState<BackupFeedback | null>(null);
  const [working, setWorking] = useState(false);
  const [activeAction, setActiveAction] = useState<"download" | "sign-in" | "verify" | "repository" | "sync" | "restore" | "apply-restore" | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [restoreReady, setRestoreReady] = useState<LibraryState | null>(null);

  useEffect(() => {
    if (!visible) {
      setPassphrase("");
      setConfirmation("");
      setRepository("");
      setBackupFeedback(null);
      setWorking(false);
      setActiveAction(null);
      setRestoreReady(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && session?.repository) setRepository(session.repository);
  }, [session?.repository, visible]);

  function showFeedback(kind: BackupFeedbackKind, title: string, detail: string) {
    setBackupFeedback({ kind, title, detail });
  }

  const setMessage = (detail: string) => showFeedback("error", "Action needs your attention", detail);

  async function downloadBackup() {
    if (passphrase !== confirmation) {
      showFeedback("error", "Passphrases do not match", "Enter the same backup passphrase in both fields before continuing.");
      feedback.error();
      return;
    }
    setWorking(true);
    setActiveAction("download");
    showFeedback("progress", "Creating your encrypted copy", "Your library is encrypted on this device before the file is downloaded.");
    try {
      const encrypted = await createEncryptedLibraryBackup(library, passphrase);
      downloadEncryptedBackup(encrypted);
      showFeedback("success", "Encrypted copy downloaded", "Keep the file and passphrase together. GitHub cannot read this copy without the passphrase.");
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "Encrypted copy not created", error instanceof Error ? error.message : "Please try creating the encrypted backup again.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function beginSignIn() {
    setWorking(true);
    setActiveAction("sign-in");
    showFeedback("progress", "Creating your GitHub code", "A one-time code is being prepared. SwarLipi never asks for your GitHub password.");
    try {
      await startSignIn(keepSignedIn);
      showFeedback("success", "GitHub code is ready", "Open GitHub, enter the code, then return here to check the connection.");
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "GitHub sign-in did not start", error instanceof Error ? error.message : "Check your connection, then try again.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function completeGitHubSignIn() {
    setWorking(true);
    setActiveAction("verify");
    showFeedback("progress", "Checking your GitHub confirmation", "Waiting for GitHub to confirm the one-time code.");
    try {
      await completeSignIn();
      showFeedback("success", "GitHub is connected", "Install the SwarLipi GitHub App on one private repository, then select it below.");
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "GitHub confirmation not complete", error instanceof Error ? error.message : "Finish the confirmation in GitHub, then check the connection again.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function saveRepository() {
    setWorking(true);
    setActiveAction("repository");
    showFeedback("progress", "Checking the private repository", "Confirming that the selected repository is private and available to SwarLipi.");
    try {
      await chooseRepository(repository);
      showFeedback("success", "Private repository connected", "This device can now sync an encrypted library copy with your other signed-in devices.");
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "Private repository not connected", error instanceof Error ? error.message : "Make sure the repository is private and the SwarLipi GitHub App is installed on it.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function uploadToGitHub() {
    if (passphrase !== confirmation) {
      showFeedback("error", "Passphrases do not match", "Enter the same backup passphrase in both fields before syncing.");
      feedback.error();
      return;
    }
    setWorking(true);
    setActiveAction("sync");
    showFeedback("progress", "Encrypting before sync", "Your library is protected on this device before anything is uploaded.");
    try {
      if (!session) throw new Error("Sign in with GitHub before syncing.");
      const encrypted = await createEncryptedLibraryBackup(library, passphrase);
      showFeedback("progress", "Uploading encrypted library", "Only the unreadable encrypted snapshot is being sent to your private repository.");
      await uploadEncryptedLibrary(session, encrypted);
      showFeedback("success", "Encrypted library synced", `A protected snapshot is now stored in ${session.repository ?? "your private repository"}.`);
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "Encrypted sync did not finish", error instanceof Error ? error.message : "Check your connection and repository access, then try syncing again.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function prepareRestore() {
    setWorking(true);
    setActiveAction("restore");
    showFeedback("progress", "Retrieving encrypted library", "Downloading the protected snapshot from your private repository.");
    try {
      if (!session) throw new Error("Sign in with GitHub before restoring.");
      const encrypted = await fetchEncryptedLibrary(session);
      showFeedback("progress", "Decrypting on this device", "Your passphrase unlocks the snapshot locally. It is never sent to GitHub.");
      const restored = await decryptEncryptedLibraryBackup(encrypted, passphrase);
      setRestoreReady(restored);
      showFeedback("success", "Restore is ready to review", `The encrypted copy contains ${restored.texts.length} texts. Your current library will remain unchanged until you choose Replace.`);
      feedback.confirm();
    } catch (error) {
      showFeedback("error", "Encrypted restore not prepared", error instanceof Error ? error.message : "Check the passphrase, connection, and repository access, then try again.");
      feedback.error();
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }

  async function applyRestore() {
    if (!restoreReady) return;
    setWorking(true);
    setActiveAction("apply-restore");
    showFeedback("progress", "Replacing this device library", "Saving the decrypted copy locally now.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    replaceLibrary(restoreReady);
    setRestoreReady(null);
    setWorking(false);
    setActiveAction(null);
    showFeedback("success", "Library restored on this device", "Your local library now matches the decrypted copy from GitHub and is saved for offline reading.");
    feedback.confirm();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backupRoot}>
        <View style={styles.backupHeader}>
          <Pressable onPress={onDismiss} hitSlop={12} style={({ pressed }) => [styles.roundIcon, pressed && styles.iconPressed]}><MaterialIcons name="close" size={22} color="#FFF8F2" /></Pressable>
          <View style={styles.backupHeaderCopy}><Text style={styles.composerEyebrow}>YOUR LIBRARY, YOUR CONTROL</Text><Text style={styles.backupHeading}>Private backup</Text></View>
          <View style={styles.backupHeaderSeal}><MaterialIcons name="lock" size={17} color="#1F151A" /></View>
        </View>
        <ScrollView contentContainerStyle={styles.backupScroll} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={["#2E223C", "#34212C", "#231A27"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.backupHero}>
            <View style={styles.backupHeroOrb} />
            <MaterialIcons name="enhanced-encryption" size={27} color="#FFCA83" />
            <Text style={styles.backupHeroTitle}>One encrypted library, on your devices.</Text>
            <Text style={styles.backupHeroText}>Sign in with your GitHub account, then encrypt before it leaves this device. GitHub receives only unreadable data.</Text>
          </LinearGradient>
          <View style={styles.backupSteps}>
            <View style={styles.backupStep}><Text style={styles.backupStepNumber}>01</Text><View style={styles.backupStepCopy}><Text style={styles.backupStepTitle}>{session ? `Connected as @${session.profile.login}` : "Connect your GitHub account"}</Text><Text style={styles.backupStepText}>{session ? session.repository ? `Private repository: ${session.repository}` : "Install the SwarLipi GitHub App on a private repository, then select it below." : "GitHub verifies the account; SwarLipi never sees your password."}</Text></View></View>
            <View style={styles.backupStep}><Text style={styles.backupStepNumber}>02</Text><View style={styles.backupStepCopy}><Text style={styles.backupStepTitle}>Keep the passphrase safe</Text><Text style={styles.backupStepText}>It unlocks your library on Android and browser. SwarLipi and GitHub never store it.</Text></View></View>
          </View>
          <Text style={styles.inputLabel}>BACKUP PASSPHRASE</Text>
          <TextInput value={passphrase} onChangeText={setPassphrase} secureTextEntry placeholder="At least 12 characters" placeholderTextColor="#82757D" style={styles.backupInput} accessibilityLabel="Backup passphrase" />
          <TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry placeholder="Confirm your passphrase" placeholderTextColor="#82757D" style={[styles.backupInput, styles.backupInputLast]} accessibilityLabel="Confirm backup passphrase" />
          {backupFeedback ? <BackupFeedbackBanner notice={backupFeedback} /> : null}
          {Platform.OS === "web" ? <Pressable disabled={working} onPress={() => void downloadBackup()} style={({ pressed }) => [styles.backupPrimaryButton, (pressed || working) && styles.saveButtonPressed]}>{activeAction === "download" ? <ActivityIndicator size="small" color="#271116" /> : <MaterialIcons name="download" size={20} color="#271116" />}<Text style={styles.backupPrimaryButtonText}>{activeAction === "download" ? "Encrypting securely…" : "Download encrypted copy"}</Text></Pressable> : <View style={styles.localBackupNotice}><MaterialIcons name="offline-pin" size={19} color="#FFBF70" /><Text style={styles.localBackupNoticeText}>Your library is saved on this device immediately. Android automatic backup may restore eligible data according to your device backup settings.</Text></View>}
          <View style={styles.backupDividerRow}><View style={styles.backupDivider} /><Text style={styles.backupDividerText}>ENCRYPTED GITHUB SYNC</Text><View style={styles.backupDivider} /></View>
          <View style={styles.githubConnectionCard}>
            <View style={styles.githubConnectionIcon}><MaterialIcons name="sync-lock" size={21} color="#EADDF7" /></View>
            <View style={styles.githubConnectionCopy}><Text style={styles.githubConnectionTitle}>Private GitHub account sync</Text><Text style={styles.githubConnectionText}>{session ? "Only your selected private repository is used. The file is encrypted before upload." : "Sign in below to connect a private repository under your own GitHub account."}</Text></View>
          </View>
          {session ? <View style={[styles.backupReadinessCard, session.repository ? styles.backupReadinessReady : styles.backupReadinessPending]}><MaterialIcons name={session.repository ? "cloud-queue" : "cloud-off"} size={20} color={session.repository ? "#9DE4D7" : "#F7BD71"} /><View style={styles.backupReadinessCopy}><Text style={styles.backupReadinessTitle}>{session.repository ? "Repository selected — choose your next safe action" : "GitHub connected — no library backup yet"}</Text><Text style={styles.backupReadinessText}>{session.repository ? "Create or update an encrypted copy with Backup. To bring writing from another device, fetch the encrypted copy, review it, then explicitly replace this library." : "Signing in never uploads your texts or notes. Choose a private repository below, then use the backup or restore controls."}</Text></View></View> : null}
          {!session ? (
            <View style={styles.githubLoginBlock}>
              <Text style={styles.inputLabel}>GITHUB SIGN-IN</Text>
              <Pressable onPress={() => setKeepSignedIn((current) => !current)} style={({ pressed }) => [styles.keepSignedInRow, pressed && styles.iconPressed]}><View style={[styles.keepSignedInBox, keepSignedIn && styles.keepSignedInBoxChecked]}>{keepSignedIn ? <MaterialIcons name="check" size={15} color="#201017" /> : null}</View><View style={styles.keepSignedInCopy}><Text style={styles.keepSignedInTitle}>Keep me signed in on this device</Text><Text style={styles.keepSignedInText}>You can log out at any time from Settings.</Text></View></Pressable>
              {!deviceCode ? <Pressable disabled={working} onPress={() => void beginSignIn()} style={({ pressed }) => [styles.githubConnectButton, (working || pressed) && styles.saveButtonPressed]}>{activeAction === "sign-in" ? <ActivityIndicator size="small" color="#D9C7F4" /> : <MaterialIcons name="login" size={19} color="#D9C7F4" />}<Text style={styles.githubConnectButtonText}>{activeAction === "sign-in" ? "Creating GitHub code…" : "Sign in with GitHub"}</Text></Pressable> : <View style={styles.deviceCodeBlock}><Text style={styles.deviceCodeLabel}>ENTER THIS CODE ON GITHUB</Text><Text selectable style={styles.deviceCodeValue}>{deviceCode.userCode}</Text><Pressable onPress={() => void openSignInPage()} style={({ pressed }) => [styles.githubConnectButton, pressed && styles.iconPressed]}><MaterialIcons name="open-in-new" size={19} color="#D9C7F4" /><Text style={styles.githubConnectButtonText}>Open GitHub confirmation</Text></Pressable><Pressable disabled={working} onPress={() => void completeGitHubSignIn()} style={({ pressed }) => [styles.backupUploadButton, (working || pressed) && styles.saveButtonPressed]}>{activeAction === "verify" ? <ActivityIndicator size="small" color="#271116" /> : <MaterialIcons name="verified-user" size={19} color="#271116" />}<Text style={styles.backupPrimaryButtonText}>{activeAction === "verify" ? "Checking GitHub…" : "Check connection"}</Text></Pressable></View>}
            </View>
          ) : (
            <View style={styles.repositorySetup}>
              <Text style={styles.inputLabel}>STEP 1 · PRIVATE REPOSITORY</Text>
              <Text style={styles.repositoryGuide}>Use the same private repository on Android and browser. If another device already has a backup, enter that repository here first.</Text>
              <TextInput value={repository} onChangeText={setRepository} autoCapitalize="none" placeholder="your-handle/SwarLipi-Backups" placeholderTextColor="#82757D" style={styles.backupInput} accessibilityLabel="Private GitHub backup repository" />
              {githubAppInstallUrl() ? <Pressable onPress={() => void openGitHubAppInstallation().catch((error) => showFeedback("error", "GitHub App did not open", error instanceof Error ? error.message : "Try opening the repository installation page again."))} style={({ pressed }) => [styles.installAppHint, pressed && styles.iconPressed]}><MaterialIcons name="open-in-new" size={16} color="#CEB8EE" /><Text style={styles.installAppHintText}>Install SwarLipi GitHub App on this private repository first</Text></Pressable> : null}
              <Pressable disabled={working || !repository.trim()} onPress={() => void saveRepository()} style={({ pressed }) => [styles.githubConnectButton, (!repository.trim() || working || pressed) && styles.saveButtonPressed]}>{activeAction === "repository" ? <ActivityIndicator size="small" color="#D9C7F4" /> : <MaterialIcons name="check-circle-outline" size={19} color="#D9C7F4" />}<Text style={styles.githubConnectButtonText}>{activeAction === "repository" ? "Checking private repository…" : "Connect this private repository"}</Text></Pressable>
              {session.repository ? <><Text style={styles.inputLabel}>STEP 2 · BACKUP OR RESTORE</Text><Text style={styles.repositoryGuide}>Backups are always manual. Restore never changes this device until you review the decrypted copy and choose Replace.</Text><Pressable disabled={working} onPress={() => void uploadToGitHub()} style={({ pressed }) => [styles.backupUploadButton, (working || pressed) && styles.saveButtonPressed]}>{activeAction === "sync" ? <ActivityIndicator size="small" color="#271116" /> : <MaterialIcons name="cloud-upload" size={19} color="#271116" />}<Text style={styles.backupPrimaryButtonText}>{activeAction === "sync" ? "Syncing encrypted library…" : "Create or update encrypted backup"}</Text></Pressable><Pressable disabled={working} onPress={() => void prepareRestore()} style={({ pressed }) => [styles.restoreButton, (working || pressed) && styles.saveButtonPressed]}>{activeAction === "restore" ? <ActivityIndicator size="small" color="#D6C5DD" /> : <MaterialIcons name="cloud-download" size={19} color="#D6C5DD" />}<Text style={styles.restoreButtonText}>{activeAction === "restore" ? "Fetching encrypted backup…" : "Fetch encrypted backup to review"}</Text></Pressable>{restoreReady ? <Pressable disabled={working} onPress={() => void applyRestore()} style={({ pressed }) => [styles.replaceLibraryButton, (pressed || working) && styles.saveButtonPressed]}>{activeAction === "apply-restore" ? <ActivityIndicator size="small" color="#2B1419" /> : <MaterialIcons name="warning-amber" size={19} color="#2B1419" />}<Text style={styles.backupPrimaryButtonText}>{activeAction === "apply-restore" ? "Replacing library…" : "Replace this device with restored library"}</Text></Pressable> : null}</> : null}
              <Pressable onPress={() => void logout().then(() => showFeedback("success", "Logged out on this device", "Your encrypted repository copy remains untouched and available when you sign in again.")).catch((error) => showFeedback("error", "Log out did not finish", error instanceof Error ? error.message : "Try logging out again."))} style={({ pressed }) => [styles.disconnectButton, pressed && styles.iconPressed]}><Text style={styles.disconnectButtonText}>Log out of GitHub on this device</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  const { texts, annotations, hydrated, preferences, updateText, reorderTexts } = useSwarLipi();
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === "web" && width >= 980;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingText, setEditingText] = useState<SavedText | null>(null);
  const [managedText, setManagedText] = useState<SavedText | null>(null);
  const [activeText, setActiveText] = useState<SavedText | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const backupLibrary = useMemo<LibraryState>(() => ({ texts, annotations, preferences }), [annotations, preferences, texts]);

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
        contentContainerStyle={[styles.listContent, isWideWeb && styles.webListContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View style={styles.brandLockup}><View style={styles.brandMark}><MaterialIcons name="menu-book" size={22} color="#1B1015" /></View><View><Text style={styles.brandText}>SwarLipi</Text>{Platform.OS === "web" ? <Text style={styles.webBrandCaption}>YOUR WORDS, YOUR SPACE</Text> : null}</View></View>
              <View style={styles.topBarActions}>{Platform.OS === "web" ? <View style={styles.localStatus}><View style={styles.localStatusDot} /><Text style={styles.localStatusText}>Saved locally</Text></View> : null}<Pressable accessibilityLabel="Open preferences" onPress={() => { feedback.tap(); setSettingsOpen(true); }} style={({ pressed }) => [styles.roundIcon, pressed && styles.iconPressed]}><MaterialIcons name="settings" size={22} color="#FFF8F2" /></Pressable></View>
            </View>
            <View style={[styles.heroLayout, isWideWeb && styles.webHeroLayout]}>
              <LinearGradient colors={["#481225", "#7B2337", "#A54A42"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.heroCard, isWideWeb && styles.webHeroCard]}>
                <View style={styles.heroDotOne} /><View style={styles.heroDotTwo} />
                <Text style={styles.heroEyebrow}>YOUR PRIVATE WORDS, IN MOTION</Text>
                <Text style={[styles.heroTitle, isWideWeb && styles.webHeroTitle]}>A beautiful place{`\n`}to return to.</Text>
                <Text style={[styles.heroCopy, isWideWeb && styles.webHeroCopy]}>Read gently. Let the text move when you are ready.</Text>
                <View style={styles.heroStats}><View><Text style={styles.heroStatValue}>{texts.length}</Text><Text style={styles.heroStatLabel}>SAVED TEXTS</Text></View><View style={styles.heroStatDivider} /><View><Text style={styles.heroStatValue}>{languageCount}</Text><Text style={styles.heroStatLabel}>LANGUAGES</Text></View><View style={styles.heroStatDivider} /><View><Text style={styles.heroStatValue}>{annotations.length}</Text><Text style={styles.heroStatLabel}>NOTES</Text></View></View>
              </LinearGradient>
              <WebLibraryPanel textCount={texts.length} annotationCount={annotations.length} wide={isWideWeb} />
            </View>
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
      <Pressable accessibilityRole="button" accessibilityLabel="Save a new text" onPress={() => { feedback.tap(); openComposer(); }} style={({ pressed }) => [styles.fab, isWideWeb && styles.webFab, pressed && styles.fabPressed]}><MaterialIcons name="add" size={28} color="#281116" /><Text style={styles.fabText}>New text</Text></Pressable>

      <ComposerSheet visible={composerOpen} editingText={editingText} onDismiss={() => { setComposerOpen(false); setEditingText(null); }} />
      <ManageSheet text={managedText} onDismiss={() => setManagedText(null)} onEdit={openManagedEdit} />
      <SettingsSheet visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} onOpenBackup={() => { setSettingsOpen(false); setBackupOpen(true); }} />
      <BackupSheet visible={backupOpen} library={backupLibrary} onDismiss={() => setBackupOpen(false)} />
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
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 37, height: 37, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#FFBD6A" },
  brandText: { color: "#FFF8F2", fontSize: 22, fontWeight: "800", letterSpacing: -0.7 },
  webBrandCaption: { color: "#9E8B92", fontSize: 8, fontWeight: "800", letterSpacing: 1.1, marginTop: 1 },
  localStatus: { height: 35, borderRadius: 18, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1C2524", borderWidth: 1, borderColor: "#30443F" },
  localStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#83D5C5" },
  localStatusText: { color: "#B9E7DE", fontSize: 11, fontWeight: "800" },
  roundIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#211921", borderWidth: 1, borderColor: "#3C3038" },
  heroLayout: { marginBottom: 18 },
  webHeroLayout: { flexDirection: "row", gap: 20, alignItems: "stretch", marginBottom: 28 },
  heroCard: { borderRadius: 28, minHeight: 238, padding: 24, overflow: "hidden", marginBottom: 18 },
  webHeroCard: { flex: 1, marginBottom: 0, minHeight: 300, padding: 36 },
  heroDotOne: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,193,112,0.18)", top: -61, right: -39 },
  heroDotTwo: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,244,222,0.10)", bottom: -55, left: 112 },
  heroEyebrow: { color: "#FFD7A8", fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginBottom: 12 },
  heroTitle: { color: "#FFF9F3", fontSize: 30, lineHeight: 35, fontWeight: "800", letterSpacing: -1.1 },
  webHeroTitle: { fontSize: 43, lineHeight: 49, letterSpacing: -1.8, maxWidth: 470 },
  heroCopy: { color: "#F6D4CC", fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 260 },
  webHeroCopy: { fontSize: 16, lineHeight: 23, maxWidth: 360, marginTop: 14 },
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
  webListContent: { width: "100%", maxWidth: 1260, alignSelf: "center", paddingBottom: 136 },
  cardShell: { minHeight: 136, borderRadius: 22, backgroundColor: "#1B161D", borderWidth: 1, borderColor: "#312832", flexDirection: "row", alignItems: "center", padding: 13, marginBottom: 11, overflow: "hidden" },
  hoverCard: { backgroundColor: "#211A22", borderColor: "#5B414D", transform: [{ translateY: -1 }] },
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
  webFab: { right: 36, bottom: 28, height: 58, paddingHorizontal: 23, shadowOpacity: 0.5, shadowRadius: 18 },
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
  backupCardPressed: { backgroundColor: "#372A39", transform: [{ scale: 0.99 }] },
  accountCard: { flexDirection: "row", gap: 12, borderRadius: 18, padding: 15, backgroundColor: "#1D2530", borderWidth: 1, borderColor: "#343F54", marginTop: 17, alignItems: "center" },
  accountMark: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#D4C0F1", alignItems: "center", justifyContent: "center" },
  accountLogout: { height: 31, borderRadius: 12, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#312630", borderWidth: 1, borderColor: "#594255" },
  accountLogoutText: { color: "#F2C5D7", fontSize: 10, fontWeight: "900" },
  settingsAccountStatus: { color: "#B6D8D2", fontSize: 11, lineHeight: 16, marginTop: 8, paddingHorizontal: 3 },
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
  readerScrollContent: { paddingHorizontal: 30, paddingTop: 31, paddingBottom: 244 },
  readerTextBlock: { paddingBottom: 38 },
  readerLanguageTag: { alignSelf: "flex-start", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(255,237,219,0.11)", marginBottom: 21 },
  readerLanguageTagText: { color: "#FFD2AD", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 },
  readerBody: { color: "#FFF2E8", fontWeight: "600", letterSpacing: -0.25 },
  readerEndMark: { marginTop: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  readerEndLine: { height: 1, width: 32, backgroundColor: "rgba(255,229,206,0.35)" },
  readerEndText: { color: "#E8C7B6", fontSize: 11, textAlign: "center", marginTop: 10, fontWeight: "700" },
  readerControls: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5, elevation: 5, overflow: "hidden", paddingHorizontal: 25, paddingTop: 17, paddingBottom: Platform.OS === "android" ? 16 : 12, borderTopWidth: 1, borderTopColor: "rgba(255,217,190,0.10)" },
  readerControlTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  readerAuxButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  readerAuxText: { color: "#FFF1E8", fontSize: 12, fontWeight: "700" },
  readerPercent: { color: "#D6B7AA", fontSize: 11, fontWeight: "700" },
  readerSliderTouch: { height: 30, justifyContent: "center" },
  progressTrack: { height: 5, borderRadius: 6, backgroundColor: "rgba(255,231,214,0.31)", justifyContent: "center" },
  progressFill: { height: 5, borderRadius: 6, backgroundColor: "#FFF3E9" },
  progressThumb: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#FFF9F3", marginLeft: -6.5, shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  speedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 9, marginBottom: 6 },
  speedLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  speedLabel: { color: "#EACFC0", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 },
  speedValue: { color: "#FFC676", fontSize: 11, fontWeight: "800" },
  speedTrack: { height: 7, borderRadius: 7, backgroundColor: "rgba(255,233,215,0.27)", justifyContent: "center" },
  speedFill: { height: 7, borderRadius: 7 },
  speedThumb: { position: "absolute", width: 15, height: 15, borderRadius: 8, backgroundColor: "#FFF8F2", marginLeft: -7.5, borderWidth: 2, borderColor: "#52232A" },
  speedEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  speedEndText: { color: "#A98E85", fontSize: 8, fontWeight: "800", letterSpacing: 0.9 },
  playButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFF9F3", alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  playButtonPressed: { transform: [{ scale: 0.96 }], opacity: 0.94 },
  inlineSheetLayer: { ...StyleSheet.absoluteFillObject, zIndex: 30, elevation: 30, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  notesSheet: { maxHeight: WINDOW_HEIGHT * 0.5, backgroundColor: "#261820", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "android" ? 16 : 12 },
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
  backupRoot: { flex: 1, backgroundColor: "#141116" },
  backupHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 28 : 16, paddingBottom: 17, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#2E2630" },
  backupHeaderCopy: { flex: 1 },
  backupHeading: { color: "#FFF8F2", fontSize: 19, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  backupHeaderSeal: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFBF70" },
  backupScroll: { padding: 22, paddingBottom: 44 },
  backupHero: { borderRadius: 24, padding: 20, overflow: "hidden" },
  backupHeroOrb: { position: "absolute", width: 155, height: 155, borderRadius: 78, backgroundColor: "rgba(255,194,125,0.11)", right: -64, top: -70 },
  backupHeroTitle: { color: "#FFF7F2", fontSize: 23, fontWeight: "800", letterSpacing: -0.7, marginTop: 12, maxWidth: 265 },
  backupHeroText: { color: "#DBCBD9", fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 300 },
  backupSteps: { marginVertical: 23, gap: 16 },
  backupStep: { flexDirection: "row", gap: 12 },
  backupStepNumber: { color: "#F6BE74", fontSize: 11, fontWeight: "900", letterSpacing: 0.8, width: 23, marginTop: 2 },
  backupStepCopy: { flex: 1 },
  backupStepTitle: { color: "#FFF8F2", fontSize: 14, fontWeight: "800" },
  backupStepText: { color: "#AA9BA2", fontSize: 12, lineHeight: 17, marginTop: 3 },
  backupInput: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: "#3B303A", backgroundColor: "#1C171E", color: "#FFF8F2", paddingHorizontal: 15, fontSize: 14, marginBottom: 10 },
  backupInputLast: { marginBottom: 0 },
  backupStatus: { color: "#E7C9A6", fontSize: 12, lineHeight: 17, marginTop: 11 },
  backupFeedback: { flexDirection: "row", alignItems: "flex-start", gap: 11, borderRadius: 17, borderWidth: 1, padding: 13, marginTop: 12 },
  backupFeedbackProgress: { backgroundColor: "#272133", borderColor: "#55496B" },
  backupFeedbackSuccess: { backgroundColor: "#182A26", borderColor: "#3D7667" },
  backupFeedbackError: { backgroundColor: "#341F27", borderColor: "#7F434F" },
  backupFeedbackIcon: { width: 29, height: 29, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  backupFeedbackIconProgress: { backgroundColor: "#4D3E62" },
  backupFeedbackIconSuccess: { backgroundColor: "#82D5BE" },
  backupFeedbackIconError: { backgroundColor: "#F49A9C" },
  backupFeedbackCopy: { flex: 1, paddingRight: 2 },
  backupFeedbackTitle: { color: "#E1F7F0", fontSize: 12, lineHeight: 16, fontWeight: "900" },
  backupFeedbackTitleProgress: { color: "#F2E4FF" },
  backupFeedbackDetail: { color: "#C5B6BF", fontSize: 11, lineHeight: 16, marginTop: 2 },
  backupPrimaryButton: { height: 53, borderRadius: 17, backgroundColor: "#FFC071", marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  backupPrimaryButtonText: { color: "#271116", fontSize: 14, fontWeight: "900" },
  localBackupNotice: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 17, marginTop: 18, backgroundColor: "#231C22", borderWidth: 1, borderColor: "#3A3039" },
  localBackupNoticeText: { flex: 1, color: "#C4B2B8", fontSize: 12, lineHeight: 17 },
  backupDividerRow: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 23 },
  backupDivider: { flex: 1, height: 1, backgroundColor: "#352B35" },
  backupDividerText: { color: "#887B82", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  githubConnectionCard: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 19, backgroundColor: "#1B2028", borderWidth: 1, borderColor: "#303948" },
  githubConnectionIcon: { width: 37, height: 37, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#30273A" },
  githubConnectionCopy: { flex: 1 },
  githubConnectionTitle: { color: "#EEE6F7", fontSize: 13, lineHeight: 17, fontWeight: "800" },
  githubConnectionText: { color: "#AEA6B7", fontSize: 11, lineHeight: 16, marginTop: 4 },
  backupReadinessCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 16, borderWidth: 1, padding: 13, marginTop: 10 },
  backupReadinessPending: { backgroundColor: "#2C2421", borderColor: "#554233" },
  backupReadinessReady: { backgroundColor: "#1D2928", borderColor: "#36534E" },
  backupReadinessCopy: { flex: 1 },
  backupReadinessTitle: { color: "#FFF4E6", fontSize: 12, fontWeight: "800", lineHeight: 17 },
  backupReadinessText: { color: "#C1B2B5", fontSize: 11, lineHeight: 16, marginTop: 3 },
  githubConnectButton: { height: 48, borderRadius: 16, backgroundColor: "#2C2535", borderWidth: 1, borderColor: "#544363", marginTop: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  githubConnectButtonText: { color: "#DECDF2", fontSize: 13, fontWeight: "800" },
  githubLoginBlock: { marginTop: 15, borderRadius: 19, backgroundColor: "#1C1923", borderWidth: 1, borderColor: "#39303F", padding: 15 },
  keepSignedInRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 4 },
  keepSignedInBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: "#65546C", alignItems: "center", justifyContent: "center" },
  keepSignedInBoxChecked: { backgroundColor: "#FFC071", borderColor: "#FFC071" },
  keepSignedInCopy: { flex: 1 },
  keepSignedInTitle: { color: "#F8EDF3", fontSize: 12, fontWeight: "800" },
  keepSignedInText: { color: "#A99BA9", fontSize: 10, lineHeight: 14, marginTop: 2 },
  deviceCodeBlock: { alignItems: "center", paddingTop: 4 },
  deviceCodeLabel: { color: "#C5B1D7", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 6 },
  deviceCodeValue: { color: "#FFF4E7", fontSize: 27, letterSpacing: 3, fontWeight: "900", marginTop: 8 },
  repositorySetup: { marginTop: 16 },
  repositoryGuide: { color: "#B5A7AD", fontSize: 11, lineHeight: 16, marginBottom: 10 },
  backupUploadButton: { height: 49, borderRadius: 16, backgroundColor: "#FFC071", marginTop: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  installAppHintText: { color: "#C7B7D4", fontSize: 11, lineHeight: 16, marginTop: -1, marginBottom: 5 },
  installAppHint: { marginTop: -1, marginBottom: 5, flexDirection: "row", alignItems: "center", gap: 6 },
  restoreButton: { height: 48, borderRadius: 16, marginTop: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: "#2B2430", borderWidth: 1, borderColor: "#514252" },
  restoreButtonText: { color: "#E6D8EC", fontSize: 13, fontWeight: "800" },
  replaceLibraryButton: { height: 49, borderRadius: 16, backgroundColor: "#F2A36D", marginTop: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  disconnectButton: { alignSelf: "center", paddingVertical: 14, paddingHorizontal: 10, marginTop: 10 },
  disconnectButtonText: { color: "#E8A4B0", fontSize: 12, fontWeight: "800" },
  webLibraryPanel: { borderRadius: 28, backgroundColor: "#171A21", borderWidth: 1, borderColor: "#3C3D50", padding: 27, overflow: "hidden", justifyContent: "space-between" },
  webLibraryPanelWide: { width: 370 },
  webLibraryPanelNarrow: { width: "100%" },
  webPanelHalo: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(103,115,233,0.13)", right: -92, top: -104 },
  webPanelEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  webPanelStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#81D6C5" },
  webPanelEyebrow: { color: "#AAB5F9", fontSize: 9, letterSpacing: 1.1, fontWeight: "900" },
  webPanelTitle: { color: "#FFF8F2", fontSize: 25, lineHeight: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: 15, maxWidth: 285 },
  webPanelCopy: { color: "#B7AAB0", fontSize: 13, lineHeight: 19, marginTop: 10 },
  webPanelDivider: { height: 1, backgroundColor: "#343542", marginVertical: 18 },
  webPanelMetrics: { flexDirection: "row", justifyContent: "space-between" },
  webPanelMetric: { alignItems: "flex-start", gap: 4 },
  webPanelMetricValue: { color: "#FFF8F2", fontSize: 16, fontWeight: "900", marginTop: 2 },
  webPanelMetricLabel: { color: "#958990", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  webPanelFooter: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 7 },
  webPanelFooterText: { color: "#A7D9D0", fontSize: 10, fontWeight: "700", flex: 1 },
});
