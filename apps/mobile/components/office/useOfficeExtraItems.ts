import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { officeApi } from '../../services/office/officeApi';
import { resolveWebUrl } from '../../services/webOrigin';

import { type OfficeItem } from './officeItem';

const QUERY_KEY = ['office', 'extra-items'] as const;

/** Empty array identity, so an errored or empty fetch never churns consumers. */
const EMPTY: OfficeItem[] = [];

/** Just enough of the two list shapes to map them. */
interface BoardLike {
  id: string;
  title: string;
  updated_at: string;
}
interface CanvasLike extends BoardLike {
  thumbnail_url?: string | null;
}

/**
 * Boards + canvases, flattened into the Office list's item shape. Split out for
 * the sake of a test: it is the only part of this hook that can be wrong, and
 * `thumbnail_url: null` reaching `thumbnailUrl` as `null` rather than being
 * dropped would put a broken image on every canvas card.
 */
export function toOfficeItems(boards: BoardLike[], canvases: CanvasLike[]): OfficeItem[] {
  return [
    ...boards.map((b): OfficeItem => ({
      id: b.id,
      title: b.title,
      updatedAt: b.updated_at,
      kind: 'board',
    })),
    ...canvases.map((c): OfficeItem => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
      kind: 'canvas',
      // Origin-relative from the API; <Image> on native has no base to resolve
      // it against, so an unresolved path renders as an empty card.
      thumbnailUrl: resolveWebUrl(c.thumbnail_url),
    })),
  ];
}

/**
 * Boards + canvas as OfficeItems for the merged Office list. They are NOT in the
 * /docs list (DOCS_ONLY_SUBTYPES excludes them), so the Arbeiten tab fetches their
 * own list endpoints and hands the result to DocumentsView as `extraItems`.
 * Best-effort: a failing source resolves to [] rather than blocking the docs.
 *
 * Through TanStack Query rather than `useState` + `useEffect`, so the two
 * requests are cached and deduplicated. Before, every mount of the Arbeiten tab
 * fired both again and rendered an empty list until they came back — which,
 * paired with the tab screens never being frozen, is exactly the "switching
 * tabs is slow" that this is meant to fix.
 */
export function useOfficeExtraItems(): { items: OfficeItem[]; refresh: () => void } {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [boards, canvases] = await Promise.all([
        officeApi.fetchBoards().catch(() => []),
        officeApi.fetchCanvases().catch(() => []),
      ]);
      return toOfficeItems(boards, canvases);
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  return { items: data ?? EMPTY, refresh };
}
