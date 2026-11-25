import { type SiteBlock } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithDraft } from '../../test/renderWithDraft';

const auth = vi.hoisted(() => ({ locale: 'de-DE' }));
vi.mock('../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: auth.locale } }),
}));

import { BlockBackgroundField } from './BlockBackgroundField';

const blocks: SiteBlock[] = [
  { id: 'hero', type: 'hero' },
  { id: 'contact', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
];
const background = (ydoc: Parameters<typeof decodeSiteDraft>[0]) =>
  decodeSiteDraft(ydoc).blocks.find((block) => block.id === 'contact')?.background;

describe('BlockBackgroundField', () => {
  it('writes a chosen background and clears it with Automatisch', async () => {
    const { user, ydoc } = renderWithDraft(<BlockBackgroundField blockId="contact" />, { blocks });
    expect(screen.getByRole('radio', { name: 'Automatisch' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Creme' }));
    expect(background(ydoc)).toBe('hell');
    await user.click(screen.getByRole('radio', { name: 'Automatisch' }));
    expect(background(ydoc)).toBeUndefined();
  });

  it('names and paints the light background as Hellgrün in Austria', () => {
    auth.locale = 'de-AT';
    renderWithDraft(<BlockBackgroundField blockId="contact" />, { blocks });
    const dot = screen
      .getByRole('radio', { name: 'Hellgrün' })
      .querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(dot?.style.backgroundColor).toBe('rgb(230, 243, 224)');
    auth.locale = 'de-DE';
  });

  it('leaves the field out while a photo is the background', () => {
    const onPhoto: SiteBlock[] = [
      blocks[0]!,
      {
        id: 'contact',
        type: 'contact',
        title: '',
        backgroundImageUrl: 'https://example.org/a.jpg',
      },
    ];
    renderWithDraft(<BlockBackgroundField blockId="contact" />, { blocks: onPhoto });
    expect(screen.queryByText('Hintergrund')).toBeNull();
  });
});
