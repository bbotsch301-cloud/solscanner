/**
 * Playing a course, an album, a film — inside the app, and picking up where you left off.
 *
 * Everything used to open in an OS custom tab, which the app cannot observe: it could not tell
 * whether you watched the whole thing or dismissed it instantly, could not remember your position,
 * and could not reissue the link when the tab was reclaimed. For a book that is merely annoying. For
 * a two-hour course it makes the app unusable, because coming back means starting over.
 *
 * So media plays here. Three things follow from that and each is deliberate:
 *
 * **The position is saved as you watch, not when you leave.** An app killed by the OS never gets a
 * chance to save on the way out, and that is exactly the case this exists for.
 *
 * **Backgrounding pauses and saves.** Audio deliberately does not — `staysActiveInBackground` is on
 * for it, because putting a phone in a pocket is how people listen to things, and stopping the music
 * when the screen turns off would be a bug rather than a policy.
 *
 * **The grant is fetched through `attemptGatedGrant`**, which returns a live cached grant when there
 * is one. Re-entering this screen inside that window costs no network call, no signature and no
 * biometric prompt — the member proved ownership minutes ago.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState } from "../components/EmptyState";
import { cachedCollectibles } from "../solana/collectibles";
import { attemptGatedGrant, AccessDeniedError } from "../access/vault";
import { resolveAccess } from "../access/resolve";
import { resumeAt, savePosition } from "../vault/position";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, spacing } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

/** How often the position is written while playing. Often enough to survive a kill, rarely enough
 *  that it isn't a write per frame. */
const SAVE_EVERY_MS = 5000;

export function PlayerScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const insets = useSafeAreaInsets();
  const { solanaAddress, activeAddress, keypair } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  const mint = route.params.mint;

  const item = owner ? cachedCollectibles(owner)?.find((c) => c.mint === mint) : undefined;

  const [source, setSource] = useState<string | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  // Resolve the URL and the resume point together, so the player is created once with both rather
  // than seeking after it has already started from zero.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The no-item case resolves inside the async body rather than before it: a synchronous
      // setState in an effect cascades a render, which the compiler lint rightly refuses.
      if (!item) {
        if (!cancelled) setResolving(false);
        return;
      }
      try {
        const [grant, at] = await Promise.all([
          keypair && owner ? attemptGatedGrant(item, owner, keypair) : Promise.resolve(null),
          resumeAt(mint),
        ]);
        if (cancelled) return;
        // A vault grant when there is one; otherwise whatever the asset itself points at. A key with
        // neither is not playable, and says so rather than showing an empty black rectangle.
        const url = grant?.url ?? resolveAccess(item)?.url ?? null;
        setStartAt(at);
        setSource(url);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof AccessDeniedError ? e.message : "This item's content could not be opened.",
          );
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, mint, owner, keypair]);

  const player = useVideoPlayer(source, (p) => {
    p.currentTime = startAt;
    // Audio should survive the screen locking; that is how people listen to things. Video pausing on
    // background is handled below, so this is safe for both.
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.play();
  });

  // Written on a timer rather than on exit: an app the OS kills never runs an exit handler, and that
  // is precisely the case the member notices.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (!source) return;
    const id = setInterval(() => {
      const t = player.currentTime;
      if (!Number.isFinite(t) || Math.abs(t - lastSaved.current) < 1) return;
      lastSaved.current = t;
      void savePosition(mint, t, Number.isFinite(player.duration) ? player.duration : undefined);
    }, SAVE_EVERY_MS);
    return () => clearInterval(id);
  }, [player, mint, source]);

  // Backgrounding is the moment most likely to be followed by the process dying, so save on the way
  // out too rather than trusting the next tick to happen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      const t = player.currentTime;
      if (Number.isFinite(t))
        void savePosition(mint, t, Number.isFinite(player.duration) ? player.duration : undefined);
    });
    return () => sub.remove();
  }, [player, mint]);

  const close = useCallback(() => {
    const t = player.currentTime;
    if (Number.isFinite(t))
      void savePosition(mint, t, Number.isFinite(player.duration) ? player.duration : undefined);
    nav.goBack();
  }, [player, mint, nav]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={item?.name ?? "Playing"} size="modal" onClose={close} />

      {resolving ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Unlocking…</Text>
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <EmptyState icon="lock-closed-outline" title="Locked" subtitle={error} />
        </View>
      ) : !item ? (
        <View style={styles.centre}>
          <EmptyState
            icon="help-circle-outline"
            title="Not in this wallet"
            subtitle="This item is no longer held by the active account."
          />
        </View>
      ) : !source ? (
        <View style={styles.centre}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Nothing published yet"
            subtitle={`"${item.name}" is yours, but its content hasn't been published to the vault yet.`}
          />
        </View>
      ) : (
        <VideoView
          style={styles.video}
          player={player}
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
          contentFit="contain"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  video: { flex: 1, backgroundColor: "#000" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3), padding: spacing(4) },
  note: { color: colors.textMuted, fontSize: font.small },
});
