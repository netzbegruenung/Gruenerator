import { type BevSettings, type BevVersion } from '../../components/image-studio/bild-editor/types';

export interface PersistShape {
  versions: BevVersion[];
  activeId: string | null;
  settings?: Partial<BevSettings>;
}

/**
 * Reads the stored bild-editor state, dropping versions whose cache file was
 * evicted. Null when there is nothing usable to restore.
 */
export function loadPersistedVersions(
  raw: string | null,
  exists: (uri: string) => boolean
): PersistShape | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistShape;
    const versions = (parsed.versions ?? []).filter((v) => {
      try {
        return exists(v.image);
      } catch {
        return false;
      }
    });
    const activeId = versions.some((v) => v.id === parsed.activeId)
      ? parsed.activeId
      : (versions.at(-1)?.id ?? null);
    return { versions, activeId, settings: parsed.settings };
  } catch {
    return null;
  }
}
