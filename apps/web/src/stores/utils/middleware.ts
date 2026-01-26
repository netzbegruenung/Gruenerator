import { create, type StateCreator } from 'zustand';
import { subscribeWithSelector, devtools, persist, type PersistOptions } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface BaseStoreOptions<T> {
  name?: string;
  enablePersist?: boolean;
  enableDevtools?: boolean;
  persistOptions?: Partial<PersistOptions<T>>;
}

/**
 * Base store creator with common middleware
 * @param storeConfig - Store configuration function
 * @param options - Options for middleware
 * @returns Zustand store hook
 */
export const createBaseStore = <T extends object>(
  storeConfig: StateCreator<T, [['zustand/immer', never]], []>,
  options: BaseStoreOptions<T> = {}
) => {
  const {
    name = 'store',
    enablePersist = false,
    enableDevtools = true,
    persistOptions = {},
  } = options;

  // Build middleware chain based on options
  // Note: Order matters - immer should be innermost
  if (enablePersist && enableDevtools && process.env.NODE_ENV === 'development') {
    return create<T>()(
      subscribeWithSelector(
        persist(devtools(immer(storeConfig), { name: `Gruenerator-${name}`, enabled: true }), {
          name: `gruenerator-${name}`,
          ...persistOptions,
        } as PersistOptions<T>)
      )
    );
  }

  if (enablePersist) {
    return create<T>()(
      subscribeWithSelector(
        persist(immer(storeConfig), {
          name: `gruenerator-${name}`,
          ...persistOptions,
        } as PersistOptions<T>)
      )
    );
  }

  if (enableDevtools && process.env.NODE_ENV === 'development') {
    return create<T>()(
      subscribeWithSelector(
        devtools(immer(storeConfig), { name: `Gruenerator-${name}`, enabled: true })
      )
    );
  }

  return create<T>()(subscribeWithSelector(immer(storeConfig)));
};

/**
 * Simple store creator without middleware (für einfache Stores)
 */
export const createSimpleStore = <T extends object>(storeConfig: StateCreator<T>) => {
  return create<T>()(storeConfig);
};
