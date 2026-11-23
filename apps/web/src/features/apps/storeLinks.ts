import { type VisitorDevice } from '../../utils/platform';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=de.gruenerator.app';
// Public TestFlight beta link — swap for the App Store URL once the app is public.
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/WZnQJzvU';

export type DeviceId = Exclude<VisitorDevice, null>;

/** The store a detected phone is sent to: the /apps page, the /app redirect and the Arbeiten tab. */
export const STORE_URLS: Record<DeviceId, string> = {
  ios: TESTFLIGHT_URL,
  android: PLAY_STORE_URL,
};

/**
 * The public download link a QR code points at. Derived from the own host so beta
 * links stay on beta; anything that isn't a Grünerator domain (localhost, preview
 * builds) falls back to production, which a phone can actually reach.
 */
export const appDownloadUrl = (): string => {
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  return /(^|\.)gruenerator\.(eu|de|at)$/.test(host)
    ? `${window.location.origin}/app`
    : 'https://gruenerator.eu/app';
};
