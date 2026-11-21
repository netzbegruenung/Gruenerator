import { SITE_TITLE_MAX } from '@gruenerator/contracts';
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

const theme = (title: string) => ({
  title,
  imageUrl: '',
  content: { type: 'doc' as const, content: [] },
});

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

  it('writes a theme title to the theme at that index', () => {
    const { ydoc } = renderWithDraft(
      <InlineText path="sections.themes.1.title" placeholder="Thema" />,
      {
        themes: [
          { ...theme('Eins'), id: 't1' },
          { ...theme('Zwei'), id: 't2' },
        ],
      }
    );
    const field = screen.getByRole('textbox', { name: 'Thema' });
    expect(field).toHaveTextContent('Zwei');
    type(field, 'Wohnen');
    expect(decodeSiteDraft(ydoc).themes.map((t) => t.title)).toEqual(['Eins', 'Wohnen']);
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
    expect(textBinding('sections.about.title')).not.toBeNull();
    expect(textBinding('sections.actions.0.text')).not.toBeNull();
    expect(textBinding('sections.actions.0.link')).toBeNull();
    expect(textBinding('profile_image')).toBeNull();
    expect(richTextBinding('sections.about.content')).not.toBeNull();
    expect(richTextBinding('sections.themes.2.content')).not.toBeNull();
    expect(richTextBinding('sections.themes.2.title')).toBeNull();
  });
});
