import { SITE_TITLE_MAX, type SiteBlock, type SiteDraft } from '@gruenerator/contracts';
import { decodeSiteDraft, setSiteField } from '@gruenerator/contracts/site-ydoc';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithDraft } from '../test/renderWithDraft';

import { richTextBinding, textBinding } from './fieldBindings';
import { InlineText } from './InlineText';

function type(el: HTMLElement, text: string) {
  el.textContent = text;
  fireEvent.input(el);
}

const theme = (id: string, title: string) => ({
  id,
  title,
  imageUrl: '',
  content: { type: 'doc' as const, content: [] },
});
const themesPage = (...items: ReturnType<typeof theme>[]): SiteBlock[] => [
  { id: 'hero', type: 'hero' },
  { id: 'th', type: 'themes', items },
  { id: 'about', type: 'about', title: 'Wer ich bin', content: { type: 'doc' } },
];
const titles = (draft: SiteDraft) => {
  const block = draft.blocks.find((b) => b.id === 'th');
  return block?.type === 'themes' ? block.items.map((t) => t.title) : [];
};

describe('InlineText', () => {
  it('shows the draft value and writes what is typed back to the draft', () => {
    const { ydoc } = renderWithDraft(<InlineText path="tagline" placeholder="Tagline" />, {
      tagline: 'Alt',
    });
    const field = screen.getByRole('textbox', { name: 'Tagline' });
    expect(field).toHaveTextContent('Alt');
    type(field, 'Neu');
    expect(decodeSiteDraft(ydoc).tagline).toBe('Neu');
  });

  it('keeps a single line and the field limit', () => {
    const { ydoc } = renderWithDraft(<InlineText path="site_title" placeholder="Name" />);
    const field = screen.getByRole('textbox', { name: 'Name' });
    type(field, 'Anna\nMuster');
    expect(decodeSiteDraft(ydoc).site_title).toBe('Anna Muster');
    type(field, 'x'.repeat(SITE_TITLE_MAX + 10));
    expect(decodeSiteDraft(ydoc).site_title).toHaveLength(SITE_TITLE_MAX);
    expect(field.textContent).toHaveLength(SITE_TITLE_MAX);
  });

  it('takes a change from elsewhere only while the field is not focused', () => {
    const { ydoc } = renderWithDraft(<InlineText path="site_title" placeholder="Name" />, {
      site_title: 'Start',
    });
    const field = screen.getByRole('textbox', { name: 'Name' });
    act(() => setSiteField(ydoc, 'site_title', 'Remote'));
    expect(field).toHaveTextContent('Remote');

    field.focus();
    field.textContent = 'Getippt';
    act(() => setSiteField(ydoc, 'site_title', 'Noch einmal remote'));
    expect(field).toHaveTextContent('Getippt');
  });

  it('writes a theme title to the card with that id', () => {
    const { ydoc } = renderWithDraft(
      <InlineText path="blocks.th.items.t2.title" placeholder="Thema" />,
      { blocks: themesPage(theme('t1', 'Eins'), theme('t2', 'Zwei')) }
    );
    const field = screen.getByRole('textbox', { name: 'Thema' });
    expect(field).toHaveTextContent('Zwei');
    type(field, 'Wohnen');
    expect(titles(decodeSiteDraft(ydoc))).toEqual(['Eins', 'Wohnen']);
  });

  it('writes a block title through its block', () => {
    const { ydoc } = renderWithDraft(<InlineText path="blocks.about.title" placeholder="Titel" />, {
      blocks: themesPage(),
    });
    type(screen.getByRole('textbox', { name: 'Titel' }), 'Über mich');
    expect(decodeSiteDraft(ydoc).blocks.find((b) => b.id === 'about')).toMatchObject({
      title: 'Über mich',
    });
  });

  it('trims on blur and leaves the field on Enter', () => {
    const { ydoc } = renderWithDraft(<InlineText path="tagline" placeholder="Tagline" />);
    const field = screen.getByRole('textbox', { name: 'Tagline' });
    field.focus();
    type(field, 'Hallo ');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).not.toHaveFocus();
    expect(decodeSiteDraft(ydoc).tagline).toBe('Hallo');
  });
});

describe('field bindings', () => {
  it('resolves only the paths the page renders as text', () => {
    expect(textBinding('blocks.a.title', 'about')).not.toBeNull();
    expect(textBinding('blocks.a.items.x.text', 'actions')).not.toBeNull();
    expect(textBinding('blocks.a.items.x.link', 'actions')).toBeNull();
    expect(textBinding('blocks.a.title', null)).toBeNull();
    expect(textBinding('sections.about.title', 'about')).toBeNull();
    expect(textBinding('profile_image', null)).toBeNull();
    expect(textBinding('tagline', null)).not.toBeNull();
    expect(richTextBinding('blocks.a.content')).not.toBeNull();
    expect(richTextBinding('blocks.a.items.t.content')).not.toBeNull();
    expect(richTextBinding('blocks.a.items.t.title')).toBeNull();
  });
});
