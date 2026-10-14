/**
 * Boards, sheets and presentations used to fall through to the type icon (or,
 * for sheets, to a flattened prose excerpt). Asserts each now draws its own
 * preview from the data the feeds already carry.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { type RecentItem } from '../../hooks/useRecentActivity';

import { RecentItemsSection } from './RecentItemsSection';

// The loading skeleton pulls in Reanimated, whose worklets runtime is not
// available under jest; these cases never render it.
jest.mock('./Skeleton', () => ({ SkeletonRows: () => null, SkeletonTiles: () => null }));

const base = { date: '2026-10-01T10:00:00Z', href: '' };

const items: RecentItem[] = [
  {
    ...base,
    id: 'b1',
    title: 'Wahlkampf-Board',
    type: 'board',
    boardType: 'kanban',
    preview: { columns: [{ name: 'In Arbeit', count: 2 }] },
  },
  {
    ...base,
    id: 'w1',
    title: 'Ideen',
    type: 'board',
    boardType: 'whiteboard',
    preview: { notes: ['Lastenrad-Verleih'] },
  },
  {
    ...base,
    id: 's1',
    title: 'Budget',
    type: 'doc',
    documentType: 'sheets',
    content:
      '<table data-preview="sheet"><tr><td>Posten</td><td>Betrag</td></tr><tr><td>Plakate</td><td>1.200</td></tr></table>',
  },
  {
    ...base,
    id: 'p1',
    title: 'Deck',
    type: 'presentation',
    content: '<ol data-preview="slides" data-total="9"><li>Klimaschutz vor Ort</li></ol>',
  },
];

describe('RecentItemsSection previews', () => {
  it('draws board, sheet and presentation content in grid mode', () => {
    render(<RecentItemsSection title="Zuletzt" items={items} onOpen={() => {}} />);

    expect(screen.getByText('In Arbeit', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Lastenrad-Verleih', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Plakate', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('1.200', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Klimaschutz vor Ort', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('9 Folien', { includeHiddenElements: true })).toBeTruthy();
    // The header row is dropped, as on web.
    expect(screen.queryByText('Posten', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the type icon in the 48-dp list rows', () => {
    render(<RecentItemsSection title="Zuletzt" items={items} viewMode="list" onOpen={() => {}} />);

    expect(screen.queryByText('In Arbeit', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Plakate', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Budget')).toBeTruthy();
  });
});
