/**
 * LocalStorage Middleware for Zustand
 * Automatically persists specified state slices to localStorage
 */

import type { StoreApi } from 'zustand';

interface PersistConfig {
  key: string;
  include?: string[];
}

interface ConfigWithPersist<T> {
  persist?: PersistConfig;
  (
    set: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
    get: () => T,
    api: StoreApi<T>
  ): T;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
type GetState<T> = () => T;

export const localStorageMiddleware =
  <T extends object>(config: ConfigWithPersist<T>) =>
  (set: SetState<T>, get: GetState<T>, api: StoreApi<T>): T =>
    config(
      (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => {
        // Call original set function
        set(partial, replace);

        // Get current state after update
        const state = get() as Record<string, unknown>;

        // Persist to localStorage if persistence config exists
        if (config.persist) {
          try {
            const { key, include } = config.persist;

            // If include array is specified, only persist those keys
            if (include && Array.isArray(include)) {
              const persistData: Record<string, unknown> = {};
              include.forEach((includeKey: string) => {
                if (state[includeKey] !== undefined) {
                  persistData[includeKey] = state[includeKey];
                }
              });
              window.localStorage.setItem(key, JSON.stringify(persistData));
            } else {
              // Persist entire state
              window.localStorage.setItem(key, JSON.stringify(state));
            }
          } catch (error) {
            console.warn(`LocalStorage middleware error for key "${config.persist.key}":`, error);
          }
        }
      },
      get,
      api
    );

/**
 * Load initial state from localStorage
 */
export const loadFromLocalStorage = <T = Record<string, unknown>>(
  key: string,
  defaultValue: T = {} as T
): T => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Error loading from localStorage key "${key}":`, error);
    return defaultValue;
  }
};
