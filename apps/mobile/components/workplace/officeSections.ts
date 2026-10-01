import { type OfficeSearchItem } from '@gruenerator/contracts';

import { type RecentItem } from '../../hooks/useRecentActivity';
import { type OfficeItem, type OfficeKind } from '../office/officeItem';

type SectionKind = Exclude<OfficeKind, 'canvas'>;

/**
 * The office half of Arbeiten, one section per kind, in web's naming. Canvases
 * are left out on purpose: `useStudioMedia` already folds them into Sharepics,
 * and listing them twice would make one canvas look like two.
 */
export const OFFICE_SECTIONS: readonly { kind: SectionKind; title: string }[] = [
  { kind: 'doc', title: 'Dokumente' },
  { kind: 'sheet', title: 'Tabellen' },
  { kind: 'presentation', title: 'Präsentationen' },
  { kind: 'board', title: 'Boards' },
];

/**
 * An office item in the shape `RecentItemsSection` draws. A sheet has no card of
 * its own there, so it borrows the document card; opening still goes through
 * `pushOfficeItem`, which knows the difference.
 */
export function toRecentItem(item: OfficeItem): RecentItem {
  return {
    id: item.id,
    title: item.title,
    date: item.updatedAt,
    type: item.kind === 'sheet' ? 'doc' : item.kind,
    href: '',
    ...(item.preview != null && { content: item.preview }),
    ...(item.thumbnailUrl != null && { thumbnailUrl: item.thumbnailUrl }),
  };
}

/** Items grouped by section kind, each list kept in the order it came in. */
export function groupOfficeItems(items: OfficeItem[]): Record<SectionKind, OfficeItem[]> {
  const groups: Record<SectionKind, OfficeItem[]> = {
    doc: [],
    sheet: [],
    presentation: [],
    board: [],
  };
  for (const item of items) {
    if (item.kind !== 'canvas') groups[item.kind].push(item);
  }
  return groups;
}

const SEARCH_KIND: Record<OfficeSearchItem['kind'], SectionKind> = {
  doc: 'doc',
  sheet: 'sheet',
  pres: 'presentation',
  board: 'board',
};

/**
 * A hit from `/api/global-search/office` as an office item, so it opens through
 * `pushOfficeItem` like everything else on the page. The body excerpt stands in
 * for the preview; an empty one (title-only match) is left out.
 */
export function fromOfficeSearchItem(hit: OfficeSearchItem): OfficeItem {
  return {
    id: hit.id,
    title: hit.title,
    updatedAt: hit.updatedAt ?? '',
    kind: SEARCH_KIND[hit.kind],
    ...(hit.snippet !== '' && { preview: hit.snippet }),
  };
}

/** Case-insensitive title match for the media sections, which have no endpoint. */
export function filterByTitle<T extends { title: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.title.toLowerCase().includes(q));
}
