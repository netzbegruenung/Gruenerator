/**
 * Which update banner to show, if any. Three sources can offer something at
 * once; one banner is shown at a time.
 */

/** App Store page; `ascAppId` in eas.json. */
export const IOS_APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6740809955';

export type UpdateBanner =
  /** Something is downloaded and only needs a restart. */
  | { kind: 'restart'; source: 'ota' | 'play'; key: string }
  /** A newer store build exists. */
  | { kind: 'store'; key: string };

export interface UpdateBannerInput {
  /** A Play flexible update is downloaded. */
  playDownloaded: boolean;
  /** Id of a downloaded OTA update waiting for a reload, or null. */
  otaPendingId: string | null;
  /** Newer store version (iOS version string, Android versionCode), or null. */
  storeVersion: string | null;
  /** Keys the person has answered with „Später". */
  dismissed: ReadonlySet<string>;
}

export function storeBannerKey(storeVersion: string): string {
  return `store:${storeVersion}`;
}

/**
 * A downloaded store build first — it replaces the JS too, so an OTA restart
 * before it would be wasted. Then the OTA restart, which costs a second. The
 * store offer last: it means a download.
 */
export function chooseUpdateBanner(input: UpdateBannerInput): UpdateBanner | null {
  const candidates: UpdateBanner[] = [];
  if (input.playDownloaded) {
    candidates.push({ kind: 'restart', source: 'play', key: 'play:downloaded' });
  }
  if (input.otaPendingId) {
    candidates.push({ kind: 'restart', source: 'ota', key: `ota:${input.otaPendingId}` });
  }
  if (input.storeVersion) {
    candidates.push({ kind: 'store', key: storeBannerKey(input.storeVersion) });
  }
  return candidates.find((banner) => !input.dismissed.has(banner.key)) ?? null;
}

/**
 * Whether `candidate` is a higher dotted version than `installed`, comparing
 * numerically per component (`1.10.0` > `1.9.0`, `1.6` == `1.6.0`).
 */
export function isNewerVersion(candidate: string, installed: string): boolean {
  const a = candidate.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = installed.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
