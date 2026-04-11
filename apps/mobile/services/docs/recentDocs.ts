import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@docs-expo/recent-doc-ids';
const MAX_RECENT = 5;

export async function getRecentDocIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) ? (ids as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export async function trackDocumentOpen(id: string): Promise<void> {
  try {
    const existing = await getRecentDocIds();
    const updated = [id, ...existing.filter((docId) => docId !== id)].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Non-critical — silently fail
  }
}
