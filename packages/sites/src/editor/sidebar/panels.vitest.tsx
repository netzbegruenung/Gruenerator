import { SITE_BLOCKS_MAX, defaultSiteBlock, type SiteBlock } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

vi.mock('../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: 'de-DE' } }),
}));

import { BASE_DRAFT } from '../../draft/testDoc';
import { useEditorStore } from '../../stores/editorStore';
import { renderWithDraft } from '../../test/renderWithDraft';

import { BlocksPanel } from './BlocksPanel';
import { PagePanel } from './PagePanel';

const types = (ydoc: Parameters<typeof decodeSiteDraft>[0]) =>
  decodeSiteDraft(ydoc).blocks.map((b) => b.type);

let n = 0;
const newId = () => `b${++n}`;

describe('PagePanel', () => {
  it('lists the blocks in page order and gives the hero no controls', () => {
    renderWithDraft(<PagePanel selectedBlockId={null} onSelectBlock={() => {}} />);
    const items = within(screen.getByRole('list', { name: 'Bausteine der Seite' })).getAllByRole(
      'listitem'
    );
    expect(items.map((li) => within(li).getAllByRole('button')[0]?.textContent)).toEqual([
      'Profil',
      'Über mich',
      'Hero-Bild',
      'Themen',
      'Aktionen',
      'InstagramAusgeblendet',
      'Kontakt',
    ]);
    expect(screen.queryByRole('group', { name: 'Profil: Aktionen' })).toBeNull();
    const up = screen.getByRole('button', { name: 'Über mich nach oben' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).toHaveAccessibleDescription('Das Profil bleibt oben');
  });

  it('moves, hides and duplicates through the draft operations', async () => {
    const onSelect = vi.fn();
    const { user, ydoc } = renderWithDraft(
      <PagePanel selectedBlockId={null} onSelectBlock={onSelect} />
    );
    const before = types(ydoc);

    await user.click(screen.getByRole('button', { name: 'Über mich nach unten' }));
    expect(types(ydoc).slice(0, 3)).toEqual([before[0], before[2], before[1]]);

    await user.click(screen.getByRole('button', { name: 'Themen ausblenden' }));
    expect(decodeSiteDraft(ydoc).blocks.find((b) => b.type === 'themes')?.hidden).toBe(true);
    expect(screen.getByRole('button', { name: 'Themen einblenden' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Themen doppeln' }));
    expect(types(ydoc).filter((t) => t === 'themes')).toHaveLength(2);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Themen 2: Aktionen' })).toBeInTheDocument();
    // Contact exists once per page: no second one, and the button says why.
    const dup = screen.getByRole('button', { name: 'Kontakt doppeln' });
    expect(dup).toHaveAttribute('aria-disabled', 'true');
    expect(dup).toHaveAccessibleDescription('Gibt es nur einmal pro Seite');
    await user.click(dup);
    expect(types(ydoc).filter((t) => t === 'contact')).toHaveLength(1);
  });

  it('deletes only after the confirmation', async () => {
    const { user, ydoc } = renderWithDraft(
      <PagePanel selectedBlockId={null} onSelectBlock={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: 'Hero-Bild löschen' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Hero-Bild löschen?' });
    expect(types(ydoc)).toContain('heroImage');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(types(ydoc)).not.toContain('heroImage');
  });

  it('keeps focus on a move button that reaches the end of the list', async () => {
    const { user, ydoc } = renderWithDraft(
      <PagePanel selectedBlockId={null} onSelectBlock={() => {}} />
    );
    const last = decodeSiteDraft(ydoc).blocks.at(-2);
    const label = last?.type === 'socialFeed' ? 'Instagram' : '';
    const down = screen.getByRole('button', { name: `${label} nach unten` });
    await user.click(down);
    expect(screen.getByRole('button', { name: `${label} nach unten` })).toHaveFocus();
    expect(screen.getByRole('button', { name: `${label} nach unten` })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('moves focus to the next row after a delete', async () => {
    const { user } = renderWithDraft(<PagePanel selectedBlockId={null} onSelectBlock={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Hero-Bild löschen' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Hero-Bild löschen?' })).getByRole('button', {
        name: 'Löschen',
      })
    );
    expect(screen.getByRole('button', { name: 'Themen' })).toHaveFocus();
  });

  it('selects a block from the list', async () => {
    const onSelect = vi.fn();
    const { user, ydoc } = renderWithDraft(
      <PagePanel selectedBlockId={null} onSelectBlock={onSelect} />
    );
    await user.click(screen.getByRole('button', { name: 'Kontakt' }));
    expect(onSelect).toHaveBeenCalledWith(
      decodeSiteDraft(ydoc).blocks.find((b) => b.type === 'contact')?.id
    );
  });

  it('has no axe violations', async () => {
    const { container } = renderWithDraft(
      <PagePanel selectedBlockId={BASE_DRAFT.blocks[1]?.id ?? null} onSelectBlock={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BlocksPanel', () => {
  it('adds after the selected block and reports the new id', async () => {
    const onAdded = vi.fn();
    const about = BASE_DRAFT.blocks.find((b) => b.type === 'about');
    const { user, ydoc } = renderWithDraft(
      <BlocksPanel selectedBlockId={about?.id ?? null} onAdded={onAdded} />
    );
    await user.click(screen.getByRole('button', { name: /^Themen/ }));
    const blocks = decodeSiteDraft(ydoc).blocks;
    const aboutIndex = blocks.findIndex((b) => b.id === about?.id);
    expect(blocks[aboutIndex + 1]?.type).toBe('themes');
    expect(onAdded).toHaveBeenCalledWith(blocks[aboutIndex + 1]?.id);
  });

  it('adds at the end without a selection', async () => {
    const { user, ydoc } = renderWithDraft(
      <BlocksPanel selectedBlockId={null} onAdded={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /^Über mich/ }));
    expect(types(ydoc).at(-1)).toBe('about');
  });

  it('offers no hero and greys out types at their limit', () => {
    renderWithDraft(<BlocksPanel selectedBlockId={null} onAdded={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Profil/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Kontakt/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Themen/ })).toBeEnabled();
  });

  it('shows the hidden Instagram block instead of adding a second one', async () => {
    const onAdded = vi.fn();
    const { user, ydoc } = renderWithDraft(
      <BlocksPanel selectedBlockId={null} onAdded={onAdded} />
    );
    const instagram = () => decodeSiteDraft(ydoc).blocks.filter((b) => b.type === 'socialFeed');
    expect(instagram()).toHaveLength(1);
    expect(instagram()[0]?.hidden).toBe(true);
    await user.click(screen.getByRole('button', { name: /^Instagram/ }));
    expect(instagram()).toHaveLength(1);
    expect(instagram()[0]?.hidden).toBeUndefined();
    expect(onAdded).toHaveBeenCalledWith(instagram()[0]?.id);
    expect(screen.getByRole('button', { name: /^Instagram/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Themen/ })).toBeEnabled();
  });

  it('marks on the canvas where a pointed-at block would land', async () => {
    const about = BASE_DRAFT.blocks.find((b) => b.type === 'about');
    const { user } = renderWithDraft(
      <BlocksPanel selectedBlockId={about?.id ?? null} onAdded={() => {}} />
    );
    const themes = screen.getByRole('button', { name: /^Themen/ });
    await user.hover(themes);
    expect(useEditorStore.getState().insertPreview).toEqual({
      afterBlockId: about?.id,
      label: 'Themen kommt hier hin',
    });
    await user.unhover(themes);
    expect(useEditorStore.getState().insertPreview).toBeNull();
    // A hidden block comes back in place; there is nothing to mark.
    await user.hover(screen.getByRole('button', { name: /^Instagram/ }));
    expect(useEditorStore.getState().insertPreview).toBeNull();
  });

  it('greys out everything on a full page', () => {
    const blocks: SiteBlock[] = [
      defaultSiteBlock('hero', newId),
      ...Array.from({ length: SITE_BLOCKS_MAX - 1 }, () => defaultSiteBlock('about', newId)),
    ];
    renderWithDraft(<BlocksPanel selectedBlockId={null} onAdded={() => {}} />, { blocks });
    for (const button of within(
      screen.getByRole('list', { name: 'Baustein hinzufügen' })
    ).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
