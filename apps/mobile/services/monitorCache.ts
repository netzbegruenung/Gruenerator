import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

/**
 * The monitor cards (headlines, trends, polls) survive an app restart.
 *
 * Measured on the Wissen page (08.11.2026, iOS simulator, real data): the
 * headlines only arrived 642 ms after the screen mounted — they wait for both
 * the Landesverband feed and the press watcher. With the last answer restored
 * from disk, every card shows at once and refreshes in the background: the
 * restored data keeps its `dataUpdatedAt`, so it is stale and refetches on mount.
 *
 * Only `['monitor', …]` queries: public news, trends and polls, no account data.
 * Built on the installed `dehydrate`/`hydrate` instead of TanStack's persister
 * packages — those would join the `@tanstack/*` family pinned in the workspace
 * overrides, and one member lifted alone is the failure mode the overrides check
 * warns about.
 */

/** Storage keys are frozen (F0): bump the suffix when a monitor response changes shape. */
const STORAGE_KEY = 'gruenerator.monitorQueries.v1';
/** Older than a day is no longer "the last news", it is old news. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Android's AsyncStorage reads a row through a ~2 MB cursor window. */
const MAX_CHARS = 1_500_000;
/** A screen of cards settles in a burst; one write after it. */
const SAVE_DELAY_MS = 1000;

const isMonitorKey = (queryKey: readonly unknown[]): boolean => queryKey[0] === 'monitor';

export function persistMonitorQueries(client: QueryClient): void {
  // Restored queries have no observer until Wissen opens; with the default five
  // minutes they would be collected before anyone looks at them.
  client.setQueryDefaults(['monitor'], { gcTime: MAX_AGE_MS });
  void restore(client);

  let timer: ReturnType<typeof setTimeout> | null = null;
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    // The cache event types its query as `Query<any>`; the key is a QueryKey either way.
    const queryKey = event.query.queryKey as readonly unknown[];
    if (!isMonitorKey(queryKey)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save(client);
    }, SAVE_DELAY_MS);
  });
}

/** On logout, with `queryClient.clear()`: the next account starts from the network. */
export async function clearPersistedMonitorQueries(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to protect: the entry expires after a day anyway.
  }
}

async function restore(client: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as DehydratedState;
    const now = Date.now();
    // `hydrate` never overwrites newer data, so a fetch that beat the disk read wins.
    hydrate(client, {
      mutations: [],
      queries: state.queries.filter((q) => now - q.state.dataUpdatedAt < MAX_AGE_MS),
    });
  } catch {
    // Unreadable or from an older shape: start from the network, as before.
  }
}

async function save(client: QueryClient): Promise<void> {
  const state = dehydrate(client, {
    shouldDehydrateQuery: (q) => isMonitorKey(q.queryKey) && q.state.status === 'success',
  });
  const json = JSON.stringify(state);
  if (json.length > MAX_CHARS) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, json);
  } catch {
    // A full or unavailable store only costs the instant start.
  }
}
