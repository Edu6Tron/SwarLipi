import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const run = (action: () => Promise<void>) => {
  if (Platform.OS !== "web") void action();
};

export const feedback = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(() => Haptics.selectionAsync()),
  confirm: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  destructive: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
