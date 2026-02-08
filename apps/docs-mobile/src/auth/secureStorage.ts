/**
 * Capacitor Secure Storage for Docs Mobile
 *
 * Uses Capacitor Preferences plugin for token storage.
 * Falls back to localStorage for development in browser.
 */

const ACCESS_TOKEN_KEY = 'docs_access_token';
const REFRESH_TOKEN_KEY = 'docs_refresh_token';
const USER_KEY = 'docs_user';
const TOKEN_EXPIRY_KEY = 'docs_token_expiry';

interface StoredUser {
  id: string;
  email?: string;
  display_name?: string;
  avatar_robot_id?: number;
  keycloak_id?: string | null;
  [key: string]: unknown;
}

let preferencesModule: typeof import('@capacitor/preferences') | null = null;
let preferencesLoadFailed = false;

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (
      window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() ?? false
  );
}

async function getPreferences(): Promise<typeof import('@capacitor/preferences') | null> {
  if (!isCapacitorNative()) return null;
  if (preferencesLoadFailed) return null;
  if (preferencesModule) return preferencesModule;

  try {
    preferencesModule = await import('@capacitor/preferences');
    return preferencesModule;
  } catch {
    preferencesLoadFailed = true;
    return null;
  }
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  user?: StoredUser,
  expiresIn?: number
): Promise<void> {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      await prefs.Preferences.set({ key: ACCESS_TOKEN_KEY, value: accessToken });
      await prefs.Preferences.set({ key: REFRESH_TOKEN_KEY, value: refreshToken });
      if (user) {
        await prefs.Preferences.set({ key: USER_KEY, value: JSON.stringify(user) });
      }
      if (expiresAt) {
        await prefs.Preferences.set({ key: TOKEN_EXPIRY_KEY, value: String(expiresAt) });
      }
      return;
    }
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (expiresAt) localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
}

export async function getAccessToken(): Promise<string | null> {
  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      const result = await prefs.Preferences.get({ key: ACCESS_TOKEN_KEY });
      return result.value || null;
    }
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      const result = await prefs.Preferences.get({ key: REFRESH_TOKEN_KEY });
      return result.value || null;
    }
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      const result = await prefs.Preferences.get({ key: USER_KEY });
      if (result.value) return JSON.parse(result.value);
      return null;
    }
  }

  const userJson = localStorage.getItem(USER_KEY);
  if (userJson) {
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }
  return null;
}

export async function isTokenExpired(bufferSeconds = 60): Promise<boolean> {
  let expiryStr: string | null = null;

  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      const result = await prefs.Preferences.get({ key: TOKEN_EXPIRY_KEY });
      expiryStr = result.value || null;
    }
  } else {
    expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
  }

  if (!expiryStr) return true;
  return Date.now() >= parseInt(expiryStr, 10) - bufferSeconds * 1000;
}

export async function updateAccessToken(accessToken: string, expiresIn?: number): Promise<void> {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      await prefs.Preferences.set({ key: ACCESS_TOKEN_KEY, value: accessToken });
      if (expiresAt) {
        await prefs.Preferences.set({ key: TOKEN_EXPIRY_KEY, value: String(expiresAt) });
      }
      return;
    }
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (expiresAt) localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
}

export async function updateStoredUser(user: StoredUser): Promise<void> {
  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      await prefs.Preferences.set({ key: USER_KEY, value: JSON.stringify(user) });
      return;
    }
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearTokens(): Promise<void> {
  if (isCapacitorNative()) {
    const prefs = await getPreferences();
    if (prefs) {
      await prefs.Preferences.remove({ key: ACCESS_TOKEN_KEY });
      await prefs.Preferences.remove({ key: REFRESH_TOKEN_KEY });
      await prefs.Preferences.remove({ key: USER_KEY });
      await prefs.Preferences.remove({ key: TOKEN_EXPIRY_KEY });
      return;
    }
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export async function hasStoredAuth(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  return !!refreshToken;
}
