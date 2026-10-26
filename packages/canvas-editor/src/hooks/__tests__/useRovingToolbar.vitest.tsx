import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PiImage, PiTextAa } from 'react-icons/pi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubsectionTabBar } from '../../sidebar/SubsectionTabBar';
import { axe } from '../../test-utils';
import { TOOLBAR_ITEMS_WITH_INPUTS, useRovingToolbar } from '../useRovingToolbar';

function Bar() {
  const roving = useRovingToolbar<HTMLDivElement>();
  return (
    <div {...roving} role="toolbar" aria-label="Test">
      <button type="button">Eins</button>
      <button type="button" disabled>
        Zwei
      </button>
      <button type="button">Drei</button>
    </div>
  );
}

describe('useRovingToolbar', () => {
  it('has one tab stop and moves with Left/Right/Home/End, skipping disabled items', async () => {
    const { container } = render(<Bar />);
    const eins = screen.getByRole('button', { name: 'Eins' });
    const drei = screen.getByRole('button', { name: 'Drei' });
    expect(eins).toHaveAttribute('tabindex', '0');
    expect(drei).toHaveAttribute('tabindex', '-1');

    eins.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(drei).toHaveFocus();
    expect(drei).toHaveAttribute('tabindex', '0');
    expect(eins).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{ArrowRight}');
    expect(eins).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(drei).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(eins).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(drei).toHaveFocus();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('ignores arrows with a modifier', async () => {
    render(<Bar />);
    const eins = screen.getByRole('button', { name: 'Eins' });
    eins.focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(eins).toHaveFocus();
  });
});

describe('SubsectionTabBar (mobile)', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 899px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  const subsections = [
    { id: 'a', icon: PiTextAa, label: 'Farbe', content: <p>Inhalt A</p> },
    { id: 'b', icon: PiImage, label: 'Breite', content: <p>Inhalt B</p> },
  ];

  it('is a tablist with a labelled tabpanel and arrow-key navigation', async () => {
    const { container } = render(<SubsectionTabBar subsections={subsections} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel', { name: 'Farbe' });
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);

    tabs[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('tabpanel', { name: 'Breite' })).toHaveTextContent('Inhalt B');

    expect(await axe(container)).toHaveNoViolations();
  });
});

function BarWithInputs() {
  const roving = useRovingToolbar<HTMLDivElement>(TOOLBAR_ITEMS_WITH_INPUTS);
  return (
    <div {...roving} role="toolbar" aria-label="Test">
      <button type="button">Eins</button>
      <input type="range" aria-label="Regler" min={-45} max={45} defaultValue={0} />
      <input type="text" aria-label="Feld" defaultValue="12" />
      <button type="button">Drei</button>
    </div>
  );
}

describe('useRovingToolbar with inputs', () => {
  it('reaches inputs with the arrows, leaves their own arrows alone and moves on with Tab', async () => {
    render(<BarWithInputs />);
    const eins = screen.getByRole('button', { name: 'Eins' });
    const slider = screen.getByRole('slider', { name: 'Regler' });
    const field = screen.getByRole('textbox', { name: 'Feld' });
    const drei = screen.getByRole('button', { name: 'Drei' });
    expect(slider).toHaveAttribute('tabindex', '-1');

    eins.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(slider).toHaveFocus();
    // Der Regler behält seine Pfeile: der Fokus bleibt.
    await userEvent.keyboard('{ArrowRight}');
    expect(slider).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(field).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{Home}');
    expect(field).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(drei).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(field).toHaveFocus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(slider).toHaveFocus();
  });
});
