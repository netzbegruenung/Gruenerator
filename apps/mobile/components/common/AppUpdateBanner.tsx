import { getContractsClient } from '@gruenerator/shared/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { PlayInAppUpdates } from '../../modules/play-in-app-updates';
import { Updates, type UpdatesModule } from '../../services/expoUpdates';
import {
  IOS_APP_STORE_URL,
  chooseUpdateBanner,
  isNewerVersion,
  storeBannerKey,
  type UpdateBanner,
} from '../../services/updateBanner';
import { borderRadius, chatType, colors, spacing } from '../../theme';

// The launch check is expo-updates' own (`checkAutomatically: ON_LOAD`); this
// covers the app that comes back from the background without a cold start.
const RECHECK_AFTER_MS = 30 * 60 * 1000;

// F0: persisted. The store version last answered with „Später" — that version
// is not offered again, the next one is.
const DISMISSED_STORE_KEY = 'app-update-banner:dismissed-store-version';

/** Version string of the running binary; with `runtimeVersion: appVersion` OTA cannot change it. */
const INSTALLED_VERSION = Constants.expoConfig?.version ?? '0.0.0';

interface OtaState {
  pendingId: string | null;
  isRestarting: boolean;
}

const NO_OTA: OtaState = { pendingId: null, isRestarting: false };

/**
 * Offers what is new: a restart once an OTA update or a Play update is
 * downloaded, and the store when a newer binary is out. Never restarts on its
 * own — `reloadAsync()` drops a running chat stream and unsaved edits, and a
 * declined OTA update still applies on the next cold start.
 */
export function AppUpdateBanner() {
  return Updates?.isEnabled ? <OtaAwareBanner updates={Updates} /> : <Banner ota={NO_OTA} />;
}

// Only reached from OtaAwareBanner, which renders only when the module loaded.
function useExpoUpdates() {
  return (Updates as UpdatesModule).useUpdates();
}

// Two components because `useUpdates()` is a hook and must not run at all when
// the native module is missing.
function OtaAwareBanner({ updates }: { updates: UpdatesModule }) {
  const { isUpdatePending, isRestarting, downloadedUpdate } = useExpoUpdates();
  const ota: OtaState = {
    pendingId: isUpdatePending ? (downloadedUpdate?.updateId ?? 'pending') : null,
    isRestarting,
  };
  return <Banner ota={ota} updates={updates} />;
}

async function checkOta(updates: UpdatesModule): Promise<void> {
  const result = await updates.checkForUpdateAsync();
  if (result.isAvailable) await updates.fetchUpdateAsync();
}

/** Newer store version as a banner key source, or null. */
async function checkStore(): Promise<{ version: string | null; playDownloaded: boolean }> {
  if (Platform.OS === 'android') {
    if (!PlayInAppUpdates) return { version: null, playDownloaded: false };
    const info = await PlayInAppUpdates.check();
    return {
      version: info.available ? String(info.versionCode) : null,
      playDownloaded: info.downloaded,
    };
  }
  if (Platform.OS === 'ios') {
    const result = await getContractsClient().appRelease.getIosStoreRelease();
    const live = result.status === 200 ? result.body.version : null;
    return {
      version: live && isNewerVersion(live, INSTALLED_VERSION) ? live : null,
      playDownloaded: false,
    };
  }
  return { version: null, playDownloaded: false };
}

function Banner({ ota, updates }: { ota: OtaState; updates?: UpdatesModule }) {
  const [storeVersion, setStoreVersion] = useState<string | null>(null);
  const [playDownloaded, setPlayDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const refresh = useCallback(async () => {
    const store = await checkStore().catch(() => null);
    if (store) {
      setStoreVersion(store.version);
      setPlayDownloaded(store.playDownloaded);
    }
  }, []);

  useEffect(() => {
    // Development: walk through the Play flow on an emulator without a release
    // (`EXPO_PUBLIC_SIMULATE_PLAY_UPDATE=<versionCode>`).
    const simulated = __DEV__ ? Number(process.env.EXPO_PUBLIC_SIMULATE_PLAY_UPDATE) : NaN;
    const ready =
      simulated > 0 && PlayInAppUpdates
        ? PlayInAppUpdates.simulateUpdateForTesting(simulated).catch(() => {})
        : Promise.resolve();

    void AsyncStorage.getItem(DISMISSED_STORE_KEY)
      .then((version) => {
        if (version) setDismissed((prev) => new Set(prev).add(storeBannerKey(version)));
      })
      .catch(() => {});
    void ready.then(refresh);

    const playSubscription = PlayInAppUpdates?.addListener('onDownloaded', () =>
      setPlayDownloaded(true)
    );

    let lastCheckedAt = Date.now();
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || Date.now() - lastCheckedAt < RECHECK_AFTER_MS) return;
      lastCheckedAt = Date.now();
      // Offline or server down: the next foreground or cold start tries again.
      if (updates) void checkOta(updates).catch(() => {});
      void refresh();
    });

    return () => {
      playSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [refresh, updates]);

  const banner = chooseUpdateBanner({
    playDownloaded,
    otaPendingId: ota.pendingId,
    storeVersion,
    dismissed,
  });

  const bannerKey = banner?.key ?? null;
  const announcement = banner ? texts(banner).message : null;
  useEffect(() => {
    if (bannerKey && announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [bannerKey, announcement]);

  if (!banner) return null;

  const dismiss = () => {
    setDismissed((prev) => new Set(prev).add(banner.key));
    if (banner.kind === 'store' && storeVersion) {
      void AsyncStorage.setItem(DISMISSED_STORE_KEY, storeVersion).catch(() => {});
    }
  };

  const act = () => {
    if (banner.kind === 'restart' && banner.source === 'ota') {
      void updates?.reloadAsync().catch(dismiss);
    } else if (banner.kind === 'restart') {
      void PlayInAppUpdates?.completeUpdate().catch(dismiss);
    } else if (Platform.OS === 'android') {
      // Play shows its own dialog; once downloaded, `onDownloaded` brings the restart.
      setDismissed((prev) => new Set(prev).add(banner.key));
      void PlayInAppUpdates?.startFlexibleUpdate().catch(() => {});
    } else {
      setDismissed((prev) => new Set(prev).add(banner.key));
      void Linking.openURL(IOS_APP_STORE_URL).catch(() => {});
    }
  };

  const { message, action } = texts(banner);

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.xsmall }]}>
      <Animated.View
        key={banner.key}
        entering={FadeInUp}
        exiting={FadeOutUp}
        testID="app-update-banner"
        style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        <Ionicons name="cloud-download-outline" size={18} color={theme.textGreen} />
        <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
        <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={8} style={styles.action}>
          <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>Später</Text>
        </Pressable>
        <Pressable
          onPress={act}
          disabled={ota.isRestarting}
          accessibilityRole="button"
          hitSlop={8}
          style={[styles.action, styles.primary]}
        >
          <Text style={[styles.actionLabel, styles.primaryLabel]}>{action}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function texts(banner: UpdateBanner): { message: string; action: string } {
  if (banner.kind === 'restart') return { message: 'Neue Version geladen', action: 'Neu starten' };
  const store = Platform.OS === 'ios' ? 'App Store' : 'Play Store';
  return { message: `Neue Version im ${store}`, action: 'Aktualisieren' };
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.xsmall,
    paddingLeft: spacing.small,
    paddingRight: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  message: {
    ...chatType.chatLabel,
    flex: 1,
  },
  action: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.small,
  },
  primary: {
    backgroundColor: colors.primary[600],
  },
  actionLabel: {
    ...chatType.chatLabel,
  },
  primaryLabel: {
    color: colors.white,
  },
});
