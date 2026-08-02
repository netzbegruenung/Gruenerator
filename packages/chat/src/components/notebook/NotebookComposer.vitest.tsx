/**
 * The notebook composer's depth control.
 *
 * Two things are pinned. First, all three tiers are offered — the menu used to
 * hardcode two `DropdownMenuRadioItem`s, so a tier added to the registry would
 * have been reachable by nobody. Second, the active tier is readable without
 * opening the menu: before this it was invisible everywhere in the UI, so
 * nothing on screen distinguished an answer built from one search from one built
 * from three.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NOTEBOOK_DEPTHS } from '../../lib/notebookDepth';

import { NotebookComposer } from './NotebookComposer';

import type { NotebookDepth } from '@gruenerator/contracts';

// The composer itself is assistant-ui's; only the leading slot is under test.
vi.mock('../thread/GrueneratorComposer', () => ({
  GrueneratorComposer: ({ slots }: { slots?: { leading?: React.ReactNode } }) => (
    <div>{slots?.leading}</div>
  ),
}));
vi.mock('@assistant-ui/store', () => ({
  useAuiState: () => false,
}));

function renderComposer(mode: NotebookDepth, onModeChange = vi.fn()) {
  render(<NotebookComposer mode={mode} onModeChange={onModeChange} />);
  return onModeChange;
}

describe('NotebookComposer — depth control', () => {
  it('shows the active tier without opening the menu', async () => {
    renderComposer('ultra');
    expect(screen.getByText('Ultra')).toBeInTheDocument();
  });

  it('names the active tier in the trigger label for screen readers', () => {
    renderComposer('deep');
    // The visible pill is one word; the accessible name has to say what it is.
    expect(screen.getByRole('button', { name: /Suchtiefe: Mittel/ })).toBeInTheDocument();
  });

  it('offers every tier in the registry', async () => {
    const user = userEvent.setup();
    renderComposer('fast');
    await user.click(screen.getByRole('button'));

    const items = await screen.findAllByRole('menuitemradio');
    expect(items).toHaveLength(NOTEBOOK_DEPTHS.length);
    for (const tier of NOTEBOOK_DEPTHS) {
      expect(screen.getByRole('menuitemradio', { name: new RegExp(tier.label) })).toBeVisible();
    }
  });

  it('marks exactly the active tier as checked', async () => {
    const user = userEvent.setup();
    renderComposer('deep');
    await user.click(screen.getByRole('button'));

    const checked = (await screen.findAllByRole('menuitemradio')).filter(
      (i) => i.getAttribute('aria-checked') === 'true'
    );
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent('Mittel');
  });

  it('reports the picked tier by its wire id, not its label', async () => {
    const user = userEvent.setup();
    const onModeChange = renderComposer('fast');
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByRole('menuitemradio', { name: /Ultra/ }));

    await waitFor(() => expect(onModeChange).toHaveBeenCalledWith('ultra'));
  });

  it('says what each tier costs, so "Ultra" is not just a word', async () => {
    const user = userEvent.setup();
    renderComposer('fast');
    await user.click(screen.getByRole('button'));

    for (const tier of NOTEBOOK_DEPTHS) {
      expect(await screen.findByText(tier.description)).toBeVisible();
    }
  });

  it('leaves the control out entirely when the surface does not offer it', () => {
    // The canvas-editor's in-section chat renders the same composer without a
    // mode; a tier pill there would claim a setting that does not exist.
    render(<NotebookComposer />);
    expect(screen.queryByText('Klein')).not.toBeInTheDocument();
  });
});
