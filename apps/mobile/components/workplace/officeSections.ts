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
