import { type SharepicTweak } from '@gruenerator/canvas-editor/composer';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { SharepicFinishBar, SharepicFinishSheet, SharepicSwatches } from './SharepicFinish';

const TWEAKS: SharepicTweak[] = [
  {
    id: 'farbe',
    label: 'Farbe',
    value: 'tanne',
    options: [
      { value: 'tanne', label: 'Tanne', short: 'Tanne', disabled: false, swatch: ['#005538'] },
      {
        value: 'wechsel',
        label: 'Hell und dunkel im Wechsel',
        short: 'Wechsel',
        disabled: false,
        swatch: ['#005538', '#F5F1E9'],
      },
      { value: 'mint', label: 'Mint', short: 'Mint', disabled: true, swatch: ['#8ABD24'] },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    value: 'pfeil',
    options: [
      { value: 'keine', label: 'Keine', short: 'Keine', disabled: false },
      { value: 'pfeil', label: 'Pfeil', short: 'Pfeil', disabled: false },
      { value: 'pfeil-punkte', label: 'Pfeil und Punkte', short: 'Punkte', disabled: false },
    ],
  },
  {
    id: 'nummer',
    label: 'Nummer',
    value: null,
    options: [
      { value: 'an', label: 'Mit Nummer', short: 'An', disabled: false },
      { value: 'aus', label: 'Ohne Nummer', short: 'Aus', disabled: false },
    ],
  },
  {
    id: 'aufruf',
    label: 'Aufruf',
    value: 'keiner',
    options: [
      { value: 'keiner', label: 'Kein Aufruf', short: 'Kein', disabled: false },
      { value: 'petition', label: 'Petition unterschreiben', short: 'Petition', disabled: true },
    ],
  },
];

const farbe = TWEAKS[0];

function renderBar(onReset: (() => void) | null = null) {
  const onChange = vi.fn();
  const view = render(
    <SharepicFinishBar tweaks={TWEAKS} onChange={onChange} onReset={onReset} disabled={false} />
  );
  return { ...view, onChange, user: userEvent.setup() };
}

describe('SharepicFinishBar', () => {
  it('leaves the colour out and switches an axis on a segment click', async () => {
    const { onChange, user } = renderBar();
    expect(screen.queryByRole('radiogroup', { name: 'Farbe' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Tanne' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Pfeil und Punkte' }));
    expect(onChange).toHaveBeenCalledWith('navigation', 'pfeil-punkte');
  });

  it('marks the current value and shows the short text', () => {
    renderBar();
    const pfeil = screen.getByRole('radio', { name: 'Pfeil' });
    expect(pfeil).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Pfeil und Punkte' })).toHaveTextContent('Punkte');
  });

  it('cannot activate a disabled option', async () => {
    const { onChange, user } = renderBar();
    const petition = screen.getByRole('radio', { name: 'Petition unterschreiben' });
    expect(petition).toBeDisabled();
    await user.click(petition);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('presses nothing when the draft mixes values', () => {
    renderBar();
    for (const name of ['Mit Nummer', 'Ohne Nummer']) {
      const item = screen.getByRole('radio', { name });
      expect(item).toHaveAttribute('aria-checked', 'false');
      expect(item).toHaveAttribute('data-state', 'off');
    }
  });

  it('offers the draft back only once something was switched', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Wie entworfen' })).toBeNull();
  });

  it('calls onReset from the reset button', async () => {
    const onReset = vi.fn();
    const { user } = renderBar(onReset);
    // One icon button for lg, one text button below: CSS shows exactly one.
    const resets = screen.getAllByRole('button', { name: 'Wie entworfen' });
    expect(resets).toHaveLength(2);
    await user.click(resets[0]);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderBar(() => {});
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('SharepicSwatches', () => {
  it('renders the colours as a radiogroup and switches on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SharepicSwatches
        tweak={farbe}
        onChange={onChange}
        disabled={false}
        size="sm"
        tone="header"
      />
    );
    expect(screen.getByRole('radiogroup', { name: 'Farbe' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tanne' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Hell und dunkel im Wechsel' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: 'Mint' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Hell und dunkel im Wechsel' }));
    expect(onChange).toHaveBeenCalledWith('farbe', 'wechsel');
  });
});

describe('SharepicFinishSheet', () => {
  function renderSheet() {
    const onOpenChange = vi.fn();
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <SharepicFinishSheet
        open
        onOpenChange={onOpenChange}
        tweaks={TWEAKS}
        onChange={onChange}
        onReset={onReset}
        disabled={false}
      />
    );
    return { onOpenChange, onChange, onReset, user: userEvent.setup() };
  }

  it('shows every axis including the colour and closes on "Fertig"', async () => {
    const { onOpenChange, onChange, onReset, user } = renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Feinschliff' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Farbe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schließen' })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Keine' }));
    expect(onChange).toHaveBeenCalledWith('navigation', 'keine');
    await user.click(screen.getByRole('button', { name: 'Wie entworfen' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has no axe violations', async () => {
    renderSheet();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
