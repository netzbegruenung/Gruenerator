/**
 * Desktop Secure Storage Wrapper
 *
 * Uses Tauri's store plugin for secure token storage on desktop.
 * Falls back to localStorage when not running in Tauri (for development).
 *
 * The store file is saved in the app's data directory:
 * - macOS: ~/Library/Application Support/de.gruenerator.app/
 * - Windows: %APPDATA%/de.gruenerator.app/
 * - Linux: ~/.local/share/de.gruenerator.app/
 */

import { isDesktopApp } from './platform';

const STORE_NAME = 'auth.json';
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';
const TOKEN_EXPIRY_KEY = 'token_expiry';

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

let storeInstance: any = null;
let storeLoadFailed = false;

/**
 * Get or create the Tauri store instance
 */
async function getStore(): Promise<any> {
  if (!isDesktopApp()) {
    return null;
  }

  // Don't retry if we already know it failed
  if (storeLoadFailed) {
    return null;
  }

  if (storeInstance) {
    return storeInstance;
  }

  try {
    // Dynamic import with error handling for when module doesn't exist
    const storeModule = await import('@tauri-apps/plugin-store').catch(() => null);
    if (!storeModule || !storeModule.Store) {
      console.warn('[SecureStorage] Tauri store plugin not available');
      storeLoadFailed = true;
      return null;
    }
    storeInstance = await storeModule.Store.load(STORE_NAME);
    return storeInstance;
  } catch (error) {
    console.error('[SecureStorage] Failed to load Tauri store:', error);
    storeLoadFailed = true;
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

  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        await store.set(ACCESS_TOKEN_KEY, accessToken);
        await store.set(REFRESH_TOKEN_KEY, refreshToken);
        if (user) {
          await store.set(USER_KEY, user);
        }
        if (expiresAt) {
          await store.set(TOKEN_EXPIRY_KEY, expiresAt);
        }
        await store.save();
        console.log('[SecureStorage] Tokens saved to Tauri store');
        return;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to save to Tauri store:', error);
    }
  }

  // Fallback to localStorage (development or web)
  localStorage.setItem('gruenerator_access_token', accessToken);
  localStorage.setItem('gruenerator_refresh_token', refreshToken);
  if (user) {
    localStorage.setItem('gruenerator_user', JSON.stringify(user));
  }
  if (expiresAt) {
    localStorage.setItem('gruenerator_token_expiry', String(expiresAt));
  }
  console.log('[SecureStorage] Tokens saved to localStorage (fallback)');
}

/**
 * Get the access token from secure storage
 */
export async function getAccessToken(): Promise<string | null> {
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        const token = (await store.get(ACCESS_TOKEN_KEY)) as string | undefined;
        return token || null;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to get access token from Tauri store:', error);
    }
  }

  // Fallback to localStorage
  return localStorage.getItem('gruenerator_access_token');
}

/**
 * Get the refresh token from secure storage
 */
export async function getRefreshToken(): Promise<string | null> {
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        const token = (await store.get(REFRESH_TOKEN_KEY)) as string | undefined;
        return token || null;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to get refresh token from Tauri store:', error);
    }
  }

  // Fallback to localStorage
  return localStorage.getItem('gruenerator_refresh_token');
}

/**
 * Get the stored user from secure storage
 */
export async function getStoredUser(): Promise<StoredUser | null> {
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        const user = (await store.get(USER_KEY)) as StoredUser | undefined;
        return user || null;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to get user from Tauri store:', error);
    }
  }

  // Fallback to localStorage
  const userJson = localStorage.getItem('gruenerator_user');
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
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        const expiry = (await store.get(TOKEN_EXPIRY_KEY)) as number | undefined;
        return expiry || null;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to get token expiry from Tauri store:', error);
    }
  }

  // Fallback to localStorage
  const expiry = localStorage.getItem('gruenerator_token_expiry');
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
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        await store.delete(ACCESS_TOKEN_KEY);
        await store.delete(REFRESH_TOKEN_KEY);
        await store.delete(USER_KEY);
        await store.delete(TOKEN_EXPIRY_KEY);
        await store.save();
        console.log('[SecureStorage] Tokens cleared from Tauri store');
        return;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to clear Tauri store:', error);
    }
  }

  // Fallback to localStorage
  localStorage.removeItem('gruenerator_access_token');
  localStorage.removeItem('gruenerator_refresh_token');
  localStorage.removeItem('gruenerator_user');
  localStorage.removeItem('gruenerator_token_expiry');
  // Also clear old key for backwards compatibility
  localStorage.removeItem('gruenerator_desktop_token');
  console.log('[SecureStorage] Tokens cleared from localStorage (fallback)');
}

/**
 * Update only the access token (after refresh)
 */
export async function updateAccessToken(accessToken: string, expiresIn?: number): Promise<void> {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        await store.set(ACCESS_TOKEN_KEY, accessToken);
        if (expiresAt) {
          await store.set(TOKEN_EXPIRY_KEY, expiresAt);
        }
        await store.save();
        return;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to update access token in Tauri store:', error);
    }
  }

  // Fallback to localStorage
  localStorage.setItem('gruenerator_access_token', accessToken);
  if (expiresAt) {
    localStorage.setItem('gruenerator_token_expiry', String(expiresAt));
  }
}

/**
 * Update stored user data
 */
export async function updateStoredUser(user: StoredUser): Promise<void> {
  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        await store.set(USER_KEY, user);
        await store.save();
        return;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to update user in Tauri store:', error);
    }
  }

  // Fallback to localStorage
  localStorage.setItem('gruenerator_user', JSON.stringify(user));
}

/**
 * Check if user has stored authentication
 */
export async function hasStoredAuth(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  return !!refreshToken;
}
