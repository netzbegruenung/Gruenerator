import { isDesktopApp } from './platform';

import type { Tab } from '../stores/desktopTabsStore';

const TABS_STORAGE_KEY = 'gruenerator_desktop_tabs';
const TABS_FILE_NAME = 'tabs.json';

interface PersistedTabState {
  tabs: Tab[];
  activeTabId: string | null;
  version: number;
  savedAt: number;
}

const CURRENT_VERSION = 1;

export const saveTabs = async (tabs: Tab[], activeTabId: string | null): Promise<void> => {
  const state: PersistedTabState = {
    tabs,
    activeTabId,
    version: CURRENT_VERSION,
    savedAt: Date.now(),
  };

  if (isDesktopApp()) {
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const { appConfigDir } = await import('@tauri-apps/api/path');

      const configDir = await appConfigDir();

      try {
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(configDir, { recursive: true });
      } catch {
        // Directory may already exist, ignore
      }

      await writeTextFile(TABS_FILE_NAME, JSON.stringify(state, null, 2), {
        baseDir: BaseDirectory.AppConfig,
      });
      return;
    } catch (error) {
      console.warn('[TabPersistence] Tauri fs write failed, using localStorage:', error);
    }
  }

  localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state));
};

export const loadTabs = async (): Promise<PersistedTabState | null> => {
  if (isDesktopApp()) {
    try {
      const { readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');

      const fileExists = await exists(TABS_FILE_NAME, {
        baseDir: BaseDirectory.AppConfig,
      });

      if (!fileExists) {
        return loadFromLocalStorage();
      }

      const content = await readTextFile(TABS_FILE_NAME, {
        baseDir: BaseDirectory.AppConfig,
      });

      const state = JSON.parse(content) as PersistedTabState;

      if (state.version !== CURRENT_VERSION) {
        return migrateTabState(state);
      }

      return state;
    } catch (error) {
      console.warn('[TabPersistence] Tauri fs read failed, trying localStorage:', error);
    }
  }

  return loadFromLocalStorage();
};

const loadFromLocalStorage = (): PersistedTabState | null => {
  try {
    const stored = localStorage.getItem(TABS_STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as PersistedTabState;
      if (state.version !== CURRENT_VERSION) {
        return migrateTabState(state);
      }
      return state;
    }
  } catch (error) {
    console.error('[TabPersistence] Failed to load tabs from localStorage:', error);
  }
  return null;
};

export const clearPersistedTabs = async (): Promise<void> => {
  if (isDesktopApp()) {
    try {
      const { remove, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const fileExists = await exists(TABS_FILE_NAME, {
        baseDir: BaseDirectory.AppConfig,
      });
      if (fileExists) {
        await remove(TABS_FILE_NAME, { baseDir: BaseDirectory.AppConfig });
      }
    } catch (error) {
      console.warn('[TabPersistence] Failed to clear Tauri tabs file:', error);
    }
  }
  localStorage.removeItem(TABS_STORAGE_KEY);
};

const migrateTabState = (oldState: PersistedTabState): PersistedTabState => {
  return { ...oldState, version: CURRENT_VERSION };
};
