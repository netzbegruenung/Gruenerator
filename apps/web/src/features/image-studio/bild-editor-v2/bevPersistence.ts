import { type BevSettings, type BevVersion } from './types';

/**
 * The editor's versions live in IndexedDB: a single generated PNG is ~4 MB as a
 * data URL, so localStorage (~5 MB per origin) could not hold a second one.
 * Versions and meta are separate keys, so switching versions or settings never
 * rewrites the images.
 */
const DB_NAME = 'gruenerator-bildeditor';
const STORE = 'state';
/** Where versions lived before; read once and removed. */
const LEGACY_KEY = 'gruenerator-bildeditor-v2';

export interface BevPersisted {
  versions: BevVersion[];
  activeId: string | null;
  settings?: Partial<BevSettings>;
}

type BevMeta = Omit<BevPersisted, 'versions'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB nicht verfügbar'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
    });
  } finally {
    db.close();
  }
}

function readLegacy(): BevPersisted | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BevPersisted;
    return parsed && Array.isArray(parsed.versions) ? parsed : null;
  } catch {
    return null;
  }
}

/** Null when nothing is stored or IndexedDB is unavailable — the editor then starts empty. */
export async function loadBevState(): Promise<BevPersisted | null> {
  try {
    const [versions, meta] = await Promise.all([
      run<unknown>('readonly', (s) => s.get('versions')),
      run<unknown>('readonly', (s) => s.get('meta')),
    ]);
    if (Array.isArray(versions)) {
      return {
        activeId: null,
        ...(meta as BevMeta | undefined),
        versions: versions as BevVersion[],
      };
    }
  } catch (e) {
    console.warn('[bild-editor] Versionen konnten nicht geladen werden', e);
  }
  const legacy = readLegacy();
  if (legacy) {
    try {
      await run('readwrite', (s) => s.put(legacy.versions, 'versions'));
      await run('readwrite', (s) =>
        s.put({ activeId: legacy.activeId, settings: legacy.settings }, 'meta')
      );
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* stays in localStorage; the editor saves to IndexedDB again once it has loaded */
    }
  }
  return legacy;
}

function save(key: string, value: unknown): Promise<void> {
  return run('readwrite', (s) => s.put(value, key)).then(
    () => undefined,
    (e: unknown) => console.warn(`[bild-editor] ${key} konnte nicht gespeichert werden`, e)
  );
}

export function saveBevVersions(versions: BevVersion[]): Promise<void> {
  return save('versions', versions);
}

export function saveBevMeta(meta: BevMeta): Promise<void> {
  return save('meta', meta);
}

export async function clearBevState(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_KEY);
    await run('readwrite', (s) => s.clear());
  } catch (e) {
    console.warn('[bild-editor] Versionen konnten nicht gelöscht werden', e);
  }
}
