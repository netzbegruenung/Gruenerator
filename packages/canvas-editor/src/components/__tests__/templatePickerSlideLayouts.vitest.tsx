/**
 * „Seite hinzufügen" bietet auf einer Präsentation die 16 CD-Folien an,
 * gruppiert nach Dunkel und Hell — auf allen anderen Formaten nicht.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';
import { TemplatePickerFlyout } from '../TemplatePickerFlyout';

const render$ = vi.hoisted(() => vi.fn((..._args: unknown[]) => Promise.resolve(null)));
vi.mock('../../slides/renderSlideLayoutThumbnail', () => ({
  preloadSlideLayoutPhoto: () => Promise.resolve(),
  renderSlideLayoutThumbnail: render$,
}));

const picker = (formatId: string, onAddSlideLayout = vi.fn(), currentTemplateId = 'freeform') => {
  const onClose = vi.fn();
  const view = render(
    <TemplatePickerFlyout
      isOpen
      formatId={formatId}
      currentTemplateId={currentTemplateId as 'freeform'}
      onSelectTemplate={vi.fn()}
      onDuplicateCurrent={vi.fn()}
      onClose={onClose}
      onAddSlideLayout={onAddSlideLayout}
    />
  );
  return { ...view, onAddSlideLayout, onClose };
};

describe('slide layouts in the page picker', () => {
  it('shows the dark and light layouts on a 16:9 deck', () => {
    picker('slide-16-9');
    const dark = screen.getByRole('region', { name: 'Folienlayouts Dunkel' });
    const light = screen.getByRole('region', { name: 'Folienlayouts Hell' });
    expect(within(dark).getAllByRole('button')).toHaveLength(10);
    expect(within(light).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Titelfolie, dunkel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vielen Dank, dunkel' })).toBeTruthy();
    // Die leere Seite und das Duplizieren bleiben.
    expect(screen.getByRole('button', { name: /Freies Design/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aktuelle Seite duplizieren/ })).toBeTruthy();
  });

  it('adds the picked layout and closes', () => {
    const { onAddSlideLayout, onClose } = picker('slide-16-9');
    fireEvent.click(screen.getByRole('button', { name: 'Zitat, hell' }));
    expect(onAddSlideLayout).toHaveBeenCalledWith('zitat-hell');
    expect(onClose).toHaveBeenCalled();
  });

  it.each(['post-portrait', 'post-portrait-tall', 'print-a3-hoch'])(
    'offers no slide layouts on %s',
    (formatId) => {
      picker(formatId);
      expect(screen.queryByRole('region', { name: /Folienlayouts/ })).toBeNull();
    }
  );

  it('renders the Austrian layouts for an AT deck', async () => {
    picker('slide-16-9', vi.fn(), 'freeform-at');
    await waitFor(() =>
      expect(render$).toHaveBeenCalledWith('titel', 'de-AT', expect.any(Number), expect.anything())
    );
  });

  it('has no axe violations', async () => {
    picker('slide-16-9');
    // Der Flyout hängt per Portal am body; geprüft wird der Flyout selbst.
    const flyout = screen
      .getByRole('heading', { name: 'Seite hinzufügen' })
      .closest('.fixed, [style]');
    expect(await axe(flyout as HTMLElement)).toHaveNoViolations();
  });
});
