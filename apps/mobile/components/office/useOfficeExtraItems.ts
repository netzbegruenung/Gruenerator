import { useCallback, useEffect, useState } from 'react';

import { officeApi } from '../../services/office/officeApi';

import { type OfficeItem } from './officeItem';

/**
 * Boards + canvas as OfficeItems for the merged Office list. They are NOT in the
 * /docs list (DOCS_ONLY_SUBTYPES excludes them), so the Office tab fetches their
 * own list endpoints and hands the result to DocumentsView as `extraItems`.
 * Best-effort: a failing source resolves to [] rather than blocking the docs.
 */
export function useOfficeExtraItems(): { items: OfficeItem[]; refresh: () => void } {
  const [items, setItems] = useState<OfficeItem[]>([]);

  const refresh = useCallback(() => {
    void (async () => {
      const [boards, canvases] = await Promise.all([
        officeApi.fetchBoards().catch(() => []),
        officeApi.fetchCanvases().catch(() => []),
      ]);
      const boardItems: OfficeItem[] = boards.map((b) => ({
        id: b.id,
        title: b.title,
        updatedAt: b.updated_at,
        kind: 'board',
      }));
      const canvasItems: OfficeItem[] = canvases.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updated_at,
        kind: 'canvas',
        thumbnailUrl: c.thumbnail_url ?? undefined,
      }));
      setItems([...boardItems, ...canvasItems]);
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, refresh };
}
