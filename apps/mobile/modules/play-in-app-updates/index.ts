import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface PlayUpdateInfo {
  /** A newer version is in Play and may be installed with the flexible flow. */
  available: boolean;
  /** A flexible update has been downloaded and waits for `completeUpdate`. */
  downloaded: boolean;
  versionCode: number;
}

declare class PlayInAppUpdatesModule extends NativeModule<{ onDownloaded: () => void }> {
  check(): Promise<PlayUpdateInfo>;
  startFlexibleUpdate(): Promise<boolean>;
  completeUpdate(): Promise<void>;
  simulateUpdateForTesting(versionCode: number): Promise<void>;
}

/** Null on iOS and in every binary built before this module existed. */
export const PlayInAppUpdates =
  requireOptionalNativeModule<PlayInAppUpdatesModule>('PlayInAppUpdates');
