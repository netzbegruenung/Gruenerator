/**
 * Beleg files live in IndexedDB on this device only — the server stores their
 * metadata, never the bytes. Keyed `<abrechnungId>/<belegId>`; a draft opened
 * on another device shows the metadata and asks for the file again.
 */
const DB_NAME = 'gruenerator-reisekosten';
const STORE = 'belege';

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

const key = (abrechnungId: string, belegId: string) => `${abrechnungId}/${belegId}`;

export function saveBelegFile(
  abrechnungId: string,
  belegId: string,
  file: Blob
): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.put(file, key(abrechnungId, belegId)));
}

export async function loadBelegFile(abrechnungId: string, belegId: string): Promise<Blob | null> {
  const value = await run<unknown>('readonly', (s) => s.get(key(abrechnungId, belegId)));
  return value instanceof Blob ? value : null;
}

export async function deleteBelegFile(abrechnungId: string, belegId: string): Promise<void> {
  await run('readwrite', (s) => s.delete(key(abrechnungId, belegId)));
}

/** Which belege of a draft have their file on this device. */
export async function vorhandeneBelegIds(abrechnungId: string): Promise<Set<string>> {
  const prefix = `${abrechnungId}/`;
  const keys = await run('readonly', (s) =>
    s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
  );
  return new Set(keys.map((k) => String(k).slice(prefix.length)));
}
