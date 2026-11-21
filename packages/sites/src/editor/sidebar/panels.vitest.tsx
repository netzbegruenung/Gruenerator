import { SITE_BLOCKS_MAX, defaultSiteBlock, type SiteBlock } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { BASE_DRAFT } from '../../draft/testDoc';
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
      'Instagram',
      'Kontakt',
    ]);
    expect(screen.queryByRole('group', { name: 'Profil: Aktionen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Über mich nach oben' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Themen ausblenden' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Themen doppeln' }));
    expect(types(ydoc).filter((t) => t === 'themes')).toHaveLength(2);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Themen 2: Aktionen' })).toBeInTheDocument();
    // Contact exists once per page: no second one.
    expect(screen.getByRole('button', { name: 'Kontakt doppeln' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: /^Instagram/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Themen/ })).toBeEnabled();
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
