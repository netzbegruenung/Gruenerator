/**
 * In-memory `@react-native-async-storage/async-storage` stand-in for the Node
 * lane. Async like the real thing, so tests exercise the same await paths.
 *
 * Call `__resetAsyncStorage()` in `beforeEach` — the module is a singleton, so
 * without it one test's writes leak into the next.
 */
const store = new Map<string, string>();

export function __resetAsyncStorage(): void {
  store.clear();
}

const AsyncStorage = {
  getItem: (key: string): Promise<string | null> => Promise.resolve(store.get(key) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    store.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    store.delete(key);
    return Promise.resolve();
  },
  clear: (): Promise<void> => {
    store.clear();
    return Promise.resolve();
  },
  getAllKeys: (): Promise<string[]> => Promise.resolve([...store.keys()]),
  multiRemove: (keys: string[]): Promise<void> => {
    keys.forEach((key) => store.delete(key));
    return Promise.resolve();
  },
};

export default AsyncStorage;
