import { type z } from 'zod';

/**
 * Letzte gute Antwort einer Monitor-Abfrage im localStorage.
 *
 * Die /wissen-Widgets standen nach jedem Kaltstart (neuer Tab, Reload) bis zu
 * einer Sekunde auf ihrem Platzhaltertext: die Anfragen starten erst, wenn der
 * Notebook-Seitenbaum gemountet ist, und der React-Query-Cache lebt nur im
 * Speicher. Mit dem gespeicherten Stand zeichnet das Widget sofort Inhalt.
 *
 * Gesteuert wird alles über React Query selbst: `initialDataUpdatedAt` trägt
 * den Zeitpunkt der gespeicherten Antwort, die `staleTime` des Hooks entscheidet
 * also wie gewohnt, ob im Hintergrund nachgeladen wird. Ein zweiter Tab
 * innerhalb der `staleTime` fragt den Server gar nicht erst.
 *
 * Der Eintrag wird beim Lesen gegen das Contract-Schema geprüft, damit ein
 * App-Update mit geänderter Antwortform keinen alten Stand ins Widget gibt.
 * Älter als `MAX_AGE_MS` wird nicht gezeigt: Trends von gestern sind kein
 * brauchbarer Platzhalter.
 */

// Schlüssel ist F0 (localStorage). Neue Form = neue Versionsnummer.
const PREFIX = 'gruenerator:monitor-cache:v1:';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
// Eine Snapshot-Antwort kann groß werden; über dieser Grenze lohnt der Platz nicht.
const MAX_CHARS = 300_000;

interface Entry {
  at: number;
  data: unknown;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // Safari privat / blockierter Speicher
  }
}

function read<T>(key: string, schema: z.ZodType<T>): { data: T; at: number } | null {
  const store = storage();
  const raw = store?.getItem(PREFIX + key);
  if (!store || !raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry;
    if (typeof entry.at !== 'number' || Date.now() - entry.at > MAX_AGE_MS) {
      store.removeItem(PREFIX + key);
      return null;
    }
    const parsed = schema.safeParse(entry.data);
    if (!parsed.success) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return { data: parsed.data, at: entry.at };
  } catch {
    store.removeItem(PREFIX + key);
    return null;
  }
}

function write(key: string, data: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    if (data == null) {
      store.removeItem(PREFIX + key);
      return;
    }
    const raw = JSON.stringify({ at: Date.now(), data } satisfies Entry);
    if (raw.length > MAX_CHARS) {
      store.removeItem(PREFIX + key);
      return;
    }
    store.setItem(PREFIX + key, raw);
  } catch {
    // Quota voll: ohne Cache geht es auch, nur langsamer.
  }
}

/**
 * Optionen für `useQuery`: Startwert aus dem localStorage und ein `queryFn`,
 * das jede erfolgreiche Antwort zurückschreibt. Eine leere Antwort (`null`)
 * löscht den Eintrag, damit kein überholter Stand stehen bleibt.
 */
export function persistedMonitorQuery<T>(
  queryKey: readonly unknown[],
  schema: z.ZodType<NonNullable<T>>,
  fetcher: () => Promise<T>
) {
  const key = JSON.stringify(queryKey);
  // Einmal je Hook-Aufruf gelesen; React Query fragt beide Funktionen nur ab,
  // solange die Abfrage noch nicht im Cache liegt.
  let cached: { data: NonNullable<T>; at: number } | null | undefined;
  const load = () => (cached === undefined ? (cached = read(key, schema)) : cached);
  return {
    queryKey,
    queryFn: async (): Promise<T> => {
      const data = await fetcher();
      write(key, data);
      return data;
    },
    initialData: () => load()?.data,
    initialDataUpdatedAt: () => load()?.at,
  };
}
