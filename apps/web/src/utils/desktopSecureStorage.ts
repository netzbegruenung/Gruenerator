/**
 * Desktop Secure Storage Wrapper
 *
 * Uses Tauri's store plugin for secure token storage on desktop.
 * Falls back to localStorage when not running in Tauri (for development).
 *
 * The store file is saved in the app's data directory:
 * - macOS: ~/Library/Application Support/de.gruenerator.desktop/
 * - Windows: %APPDATA%/de.gruenerator.desktop/
 * - Linux: ~/.local/share/de.gruenerator.desktop/
 *
 * Bearer model: a single opaque Better Auth session `token` (no refresh token)
 * plus the user and a hard-expiry timestamp.
 */

import { type Store, type StoreOptions } from '@tauri-apps/plugin-store';

import { isDesktopApp } from './platform';

interface TauriStoreModule {
  Store: {
    load(path: string, options?: StoreOptions): Promise<Store>;
    new (): Store;
  };
}

const STORE_NAME = 'auth.json';
const ACCESS_TOKEN_KEY = 'access_token';
// Legacy key — no longer written (bearer model has no refresh token). Still
// cleared on logout so old installs don't keep a stale refresh token around.
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';
const TOKEN_EXPIRY_KEY = 'token_expiry';

interface StoredUser {
  id: string;
  email?: string;
  display_name?: string;
  avatar_robot_id?: number;
  keycloak_id?: string | null;
  locale?: string;
  [key: string]: unknown;
}

let storeInstance: Store | null = null;
let storeLoadFailed = false;

/**
 * Get or create the Tauri store instance
 */
async function getStore(): Promise<Store | null> {
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
    const storeModule = (await import('@tauri-apps/plugin-store').catch(
      () => null
    )) as TauriStoreModule | null;
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
 * Save a Better Auth bearer session (result of the native token-exchange).
 * The opaque `token` is stored as the access token — read back by
 * getDesktopToken() → apiClient `Authorization: Bearer`. `expiresAt` is an ISO
 * timestamp from the exchange response.
 */
export async function saveSession(
  token: string,
  user?: StoredUser,
  expiresAt?: string
): Promise<void> {
  const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const hasExpiry = !Number.isNaN(expiryMs);

  if (isDesktopApp()) {
    try {
      const store = await getStore();
      if (store) {
        await store.set(ACCESS_TOKEN_KEY, token);
        if (user) await store.set(USER_KEY, user);
        if (hasExpiry) await store.set(TOKEN_EXPIRY_KEY, expiryMs);
        await store.save();
        return;
      }
    } catch (error) {
      console.error('[SecureStorage] Failed to save session to Tauri store:', error);
    }
  }

  localStorage.setItem('gruenerator_access_token', token);
  if (user) {
    localStorage.setItem('gruenerator_user', JSON.stringify(user));
  }
  if (hasExpiry) {
    localStorage.setItem('gruenerator_token_expiry', String(expiryMs));
  }
}

/**
 * Get the access (bearer) token from secure storage
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
      return JSON.parse(userJson) as StoredUser;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get token expiry timestamp (ms epoch), or null if none stored
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
