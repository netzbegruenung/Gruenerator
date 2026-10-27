import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { VorlagenHeaderActions, type VorlagenHeaderActionsProps } from './VorlagenHeaderActions';

async function renderActions(props: Partial<VorlagenHeaderActionsProps> = {}) {
  const handlers = {
    onOpenFilter: jest.fn(),
    onToggleBookmarked: jest.fn(),
    onToggleGridSize: jest.fn(),
  };
  await render(
    <VorlagenHeaderActions
      filterLabel={null}
      showListControls
      onlyBookmarked={false}
      gridSize="small"
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe('VorlagenHeaderActions', () => {
  it('shows a plain filter icon while „Alle Vorlagen" is active', async () => {
    await renderActions();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByTestId('filter-dot')).toBeNull();
  });

  it('names and marks an active filter', async () => {
    await renderActions({ filterLabel: 'Canva' });
    expect(screen.getByRole('button', { name: 'Filter: Canva' })).toBeTruthy();
    expect(screen.getByTestId('filter-dot')).toBeTruthy();
  });

  it('reports the bookmark and card size toggles as selected', async () => {
    const h = await renderActions({ onlyBookmarked: true, gridSize: 'large' });
    const bookmark = screen.getByRole('button', { name: 'Nur gemerkte Vorlagen' });
    const size = screen.getByRole('button', { name: 'Große Kacheln' });
    expect(bookmark.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(size.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

    await fireEvent.press(bookmark);
    await fireEvent.press(size);
    await fireEvent.press(screen.getByRole('button', { name: 'Filter' }));
    expect(h.onToggleBookmarked).toHaveBeenCalled();
    expect(h.onToggleGridSize).toHaveBeenCalled();
    expect(h.onOpenFilter).toHaveBeenCalled();
  });

  it('hides the list controls under „Meine Vorlagen"', async () => {
    await renderActions({ showListControls: false, filterLabel: 'Meine Vorlagen' });
    expect(screen.queryByRole('button', { name: 'Nur gemerkte Vorlagen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Große Kacheln' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter: Meine Vorlagen' })).toBeTruthy();
  });
});
