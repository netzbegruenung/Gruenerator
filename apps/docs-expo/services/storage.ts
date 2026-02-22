import * as SecureStore from 'expo-secure-store';
import { getErrorMessage } from '../utils/errors';

const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  AUTH_REFRESH_TOKEN: 'auth_refresh_token',
  AUTH_USER: 'auth_user',
} as const;

export const secureStorage = {
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to get token:', getErrorMessage(error));
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to set token:', getErrorMessage(error));
      throw error;
    }
  },

  async removeToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to remove token:', getErrorMessage(error));
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to get refresh token:', getErrorMessage(error));
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN, token);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to set refresh token:', getErrorMessage(error));
      throw error;
    }
  },

  async removeRefreshToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to remove refresh token:', getErrorMessage(error));
    }
  },

  async getUser(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_USER);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to get user:', getErrorMessage(error));
      return null;
    }
  },

  async setUser(userJson: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_USER, userJson);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to set user:', getErrorMessage(error));
      throw error;
    }
  },

  async removeUser(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_USER);
    } catch (error: unknown) {
      console.error('[SecureStorage] Failed to remove user:', getErrorMessage(error));
    }
  },

  async clearAll(): Promise<void> {
    await Promise.all([this.removeToken(), this.removeRefreshToken(), this.removeUser()]);
  },
};

export { STORAGE_KEYS };
