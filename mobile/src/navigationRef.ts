/** App-wide navigation ref, so non-component code (e.g. a notification tap) can navigate. */
import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./navigation";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Navigate from outside React (no-op until the navigator is mounted). */
export function navigate(name: keyof RootStackParamList): void {
  if (navigationRef.isReady()) navigationRef.navigate(name as never);
}
