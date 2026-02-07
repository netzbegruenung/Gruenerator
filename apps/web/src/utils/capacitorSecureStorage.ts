/**
 * Capacitor Secure Storage Wrapper
 *
 * Uses Capacitor's Preferences plugin for token storage on mobile.
 * Falls back to localStorage when not running in Capacitor (for development).
 *
 * Note: For truly sensitive data in production, consider using
 * @capacitor-community/secure-storage-plugin which uses native Keychain/Keystore.
 * The Preferences plugin stores data in plain text but is adequate for JWT tokens
 * that expire and can be revoked.
 */

import { isCapacitorApp } from './platform';

const ACCESS_TOKEN_KEY = 'gruenerator_access_token';
const REFRESH_TOKEN_KEY = 'gruenerator_refresh_token';
const USER_KEY = 'gruenerator_user';
const TOKEN_EXPIRY_KEY = 'gruenerator_token_expiry';

interface StoredUser {
  id: string;
  email?: string;
  display_name?: string;
  avatar_robot_id?: number;
  keycloak_id?: string | null;
  igel_modus?: boolean;
  locale?: string;
  [key: string]: unknown;
}

interface AuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
  user: StoredUser | null;
  expiresAt: number | null;
}

let preferencesModule: typeof import('@capacitor/preferences') | null = null;
let preferencesLoadFailed = false;

/**
 * Get Capacitor Preferences module (lazy loaded)
 */
async function getPreferences(): Promise<typeof import('@capacitor/preferences') | null> {
  if (!isCapacitorApp()) {
    return null;
  }

  if (preferencesLoadFailed) {
    return null;
  }

  if (preferencesModule) {
    return preferencesModule;
  }

  try {
    preferencesModule = await import('@capacitor/preferences');
    return preferencesModule;
  } catch (error) {
    console.error('[CapacitorStorage] Failed to load Preferences plugin:', error);
    preferencesLoadFailed = true;
    return null;
  }
}

/**
 * Save authentication tokens to secure storage
 */
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  user?: StoredUser,
  expiresIn?: number
): Promise<void> {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

  if (isCapacitorApp()) {
    try {
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
        console.log('[CapacitorStorage] Tokens saved to Capacitor Preferences');
        return;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to save to Preferences:', error);
    }
  }

  // Fallback to localStorage (development or web)
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  if (expiresAt) {
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
  }
  console.log('[CapacitorStorage] Tokens saved to localStorage (fallback)');
}

/**
 * Get the access token from secure storage
 */
export async function getAccessToken(): Promise<string | null> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        const result = await prefs.Preferences.get({ key: ACCESS_TOKEN_KEY });
        return result.value || null;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to get access token:', error);
    }
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get the refresh token from secure storage
 */
export async function getRefreshToken(): Promise<string | null> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        const result = await prefs.Preferences.get({ key: REFRESH_TOKEN_KEY });
        return result.value || null;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to get refresh token:', error);
    }
  }

  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Get the stored user from secure storage
 */
export async function getStoredUser(): Promise<StoredUser | null> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        const result = await prefs.Preferences.get({ key: USER_KEY });
        if (result.value) {
          return JSON.parse(result.value);
        }
        return null;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to get user:', error);
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

/**
 * Get token expiry timestamp
 */
export async function getTokenExpiry(): Promise<number | null> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        const result = await prefs.Preferences.get({ key: TOKEN_EXPIRY_KEY });
        return result.value ? parseInt(result.value, 10) : null;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to get token expiry:', error);
    }
  }

  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

/**
 * Check if the access token is expired or about to expire
 */
export async function isTokenExpired(bufferSeconds = 60): Promise<boolean> {
  const expiry = await getTokenExpiry();
  if (!expiry) {
    return true;
  }
  return Date.now() >= expiry - bufferSeconds * 1000;
}

/**
 * Get all authentication data
 */
export async function getAuthTokens(): Promise<AuthTokens> {
  const [accessToken, refreshToken, user, expiresAt] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getStoredUser(),
    getTokenExpiry(),
  ]);

  return { accessToken, refreshToken, user, expiresAt };
}

/**
 * Clear all tokens from secure storage
 */
export async function clearTokens(): Promise<void> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        await prefs.Preferences.remove({ key: ACCESS_TOKEN_KEY });
        await prefs.Preferences.remove({ key: REFRESH_TOKEN_KEY });
        await prefs.Preferences.remove({ key: USER_KEY });
        await prefs.Preferences.remove({ key: TOKEN_EXPIRY_KEY });
        console.log('[CapacitorStorage] Tokens cleared from Preferences');
        return;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to clear Preferences:', error);
    }
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  console.log('[CapacitorStorage] Tokens cleared from localStorage (fallback)');
}

/**
 * Update only the access token (after refresh)
 */
export async function updateAccessToken(accessToken: string, expiresIn?: number): Promise<void> {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        await prefs.Preferences.set({ key: ACCESS_TOKEN_KEY, value: accessToken });
        if (expiresAt) {
          await prefs.Preferences.set({ key: TOKEN_EXPIRY_KEY, value: String(expiresAt) });
        }
        return;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to update access token:', error);
    }
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (expiresAt) {
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
  }
}

/**
 * Update stored user data
 */
export async function updateStoredUser(user: StoredUser): Promise<void> {
  if (isCapacitorApp()) {
    try {
      const prefs = await getPreferences();
      if (prefs) {
        await prefs.Preferences.set({ key: USER_KEY, value: JSON.stringify(user) });
        return;
      }
    } catch (error) {
      console.error('[CapacitorStorage] Failed to update user:', error);
    }
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Check if user has stored authentication
 */
export async function hasStoredAuth(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  return !!refreshToken;
}
