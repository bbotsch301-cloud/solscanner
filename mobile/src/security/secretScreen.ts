/**
 * Guard for screens that display the recovery phrase. Blocks screen capture where the
 * OS allows it (Android FLAG_SECURE turns screenshots/recordings black) and, since iOS
 * can't hard-block a screenshot, detects one and warns the user immediately.
 */
import { useEffect } from "react";
import { Alert } from "react-native";
import {
  addScreenshotListener,
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from "expo-screen-capture";

export function useSecretScreenGuard() {
  useEffect(() => {
    preventScreenCaptureAsync().catch(() => {});
    const sub = addScreenshotListener(() => {
      Alert.alert(
        "Screenshot detected",
        "Never store your recovery phrase as a photo or screenshot — anyone who finds that image can steal all of your funds. Delete it and write the words on paper instead.",
      );
    });
    return () => {
      sub.remove();
      allowScreenCaptureAsync().catch(() => {});
    };
  }, []);
}
