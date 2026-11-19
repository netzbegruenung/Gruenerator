import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithDraft } from '../../../test/renderWithDraft';

import { ThemesSectionEditor } from './ThemesSectionEditor';

vi.mock('../common/ImageUpload', () => ({ ImageUpload: () => null }));
vi.mock('../common/RichTextEditorLazy', () => ({ RichTextEditor: () => null }));

const card = (title: string) => ({
  id: `id-${title}`,
  title,
  imageUrl: '',
  content: { type: 'doc' as const, content: [{ type: 'paragraph' as const }] },
});

describe('ThemesSectionEditor', () => {
  it('"Nach unten" on the first card swaps the order in the doc', async () => {
    const { user, ydoc } = renderWithDraft(<ThemesSectionEditor />, {
      themes: [card('Klima'), card('Verkehr')],
    });
    await user.click(screen.getByRole('button', { name: 'Nach unten: Klima' }));
    expect(decodeSiteDraft(ydoc).themes.map((t) => t.title)).toEqual(['Verkehr', 'Klima']);
  });

  it('disables "Nach oben" on the first card and "Nach unten" on the last', () => {
    renderWithDraft(<ThemesSectionEditor />, { themes: [card('Klima'), card('Verkehr')] });
    expect(screen.getByRole('button', { name: 'Nach oben: Klima' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nach unten: Verkehr' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nach unten: Klima' })).toBeEnabled();
  });

  it('typing a title writes it to the card', async () => {
    const { user, ydoc } = renderWithDraft(<ThemesSectionEditor />, { themes: [card('')] });
    await user.type(screen.getByLabelText('Titel'), 'Wohnen');
    expect(decodeSiteDraft(ydoc).themes[0]?.title).toBe('Wohnen');
  });

  it('add is disabled at six cards', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(card);
    renderWithDraft(<ThemesSectionEditor />, { themes: six });
    expect(screen.getByRole('button', { name: /Thema hinzufügen/ })).toBeDisabled();
    expect(screen.getByText('Höchstens 6')).toBeInTheDocument();
  });

  it('adds a card below six', async () => {
    const { user, ydoc } = renderWithDraft(<ThemesSectionEditor />, { themes: [card('a')] });
    await user.click(screen.getByRole('button', { name: /Thema hinzufügen/ }));
    expect(decodeSiteDraft(ydoc).themes).toHaveLength(2);
  });
});
