/**
 * In-memory `expo-secure-store` stand-in for the Node lane, mirroring the
 * `*ItemAsync` surface `services/storage.ts` uses.
 *
 * `__setSecureStoreFailure()` makes every call reject — `secureStorage` swallows
 * read/remove failures and rethrows on write, and that asymmetry is exactly the
 * kind of thing a test should pin down.
 */
const store = new Map<string, string>();
let failure: Error | null = null;

export function __resetSecureStore(): void {
  store.clear();
  failure = null;
}

export function __setSecureStoreFailure(error: Error | null): void {
  failure = error;
}

export function getItemAsync(key: string): Promise<string | null> {
  if (failure) return Promise.reject(failure);
  return Promise.resolve(store.get(key) ?? null);
}

export function setItemAsync(key: string, value: string): Promise<void> {
  if (failure) return Promise.reject(failure);
  store.set(key, value);
  return Promise.resolve();
}

export function deleteItemAsync(key: string): Promise<void> {
  if (failure) return Promise.reject(failure);
  store.delete(key);
  return Promise.resolve();
}
