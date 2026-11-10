/**
 * „+" auf einem Sharepic: der Seiten-Picker schlägt die Seiten des Katalogs
 * vor, die dem Design ähneln (Farbe, Foto, Thema), und hängt die gewählte an —
 * oder schreibt mit „Mit KI hinzufügen" die nächste Seite. „Vorlage ändern"
 * gestaltet eine Seite mit einer Seite des Katalogs um und behält ihren Text.
 */
import {
  CanvasEditorProvider,
  type EditorPagePickerProps,
  type EditorShellExtensions,
} from '@ggraphic/editor/shell';
import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SHAREPIC_COLOR_HEX } from '../../../composer/chromeParts';
import { axe } from '../../../test-utils';

import '../grueneratorEditorShell';

import type { CanvasVorlagenService, VorlagePage } from '../../../grueneratorHostServices';
import type { HeterogeneousPage } from '@ggraphic/editor/config';
import type { SharepicColor, SharepicSeite } from '@gruenerator/contracts';

const registered = vi.hoisted(() => ({ shell: null as EditorShellExtensions | null }));

vi.mock('@ggraphic/editor/shell', async (importOriginal) => {
  const actual = await importOriginal<{
    registerEditorShell: (extensions: EditorShellExtensions) => void;
  }>();
  return {
    ...actual,
    registerEditorShell: (extensions: EditorShellExtensions) => {
      registered.shell = extensions;
      actual.registerEditorShell(extensions);
    },
  };
});

const seite = (id: string, color: SharepicColor, over: Partial<SharepicSeite> = {}) =>
  ({
    id,
    titel: id,
    rolle: 'inhalt',
    typ: 'text',
    formats: ['post-portrait'],
    locale: 'de-DE',
    thumbVersion: 'v1',
    slide: { background: { kind: 'farbe', color }, items: [{ type: 'absatz', text: 'Text' }] },
    ...over,
  }) as unknown as SharepicSeite;

const SEITEN = [
  seite('Mint', 'mint'),
  seite('Tanne', 'tanne'),
  seite('Titel', 'tanne', { rolle: 'titel' }),
];

const page = (id: string, color: SharepicColor, deck?: string): HeterogeneousPage => ({
  id,
  configId: 'freeform',
  state: {
    backgroundMode: 'color',
    backgroundColor: SHAREPIC_COLOR_HEX[color],
    additionalTexts: [{ id: 't', text: id }],
    ...(deck ? { [SHAREPIC_SOURCE_KEY]: { v: 1, deck, slide: {} } } : {}),
  },
});

const COMPOSED: VorlagePage = {
  configId: 'freeform',
  state: { title: 'Seite', [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'eigenes', slide: {} } },
};

function setup(
  props: Partial<EditorPagePickerProps> = {},
  service: Partial<CanvasVorlagenService> = {}
) {
  const Picker = registered.shell?.pagePicker?.Picker;
  if (!Picker) throw new Error('the Grünerator shell registered no page picker');
  const vorlagen: CanvasVorlagenService = {
    listSeiten: vi.fn(() => Promise.resolve(SEITEN)),
    composeSeite: vi.fn(() => Promise.resolve([COMPOSED])),
    ...service,
  };
  const addPage = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <CanvasEditorProvider services={{ vorlagen }}>
      <Picker
        isOpen
        onClose={onClose}
        mode="add"
        currentTemplateId="freeform"
        activeTemplateId="freeform"
        pages={[page('p1', 'tanne', 'karussell'), page('p2', 'tanne', 'karussell')]}
        formatId="post-portrait"
        onSelectTemplate={vi.fn()}
        addPage={addPage}
        onDuplicateCurrent={vi.fn()}
        {...props}
      />
    </CanvasEditorProvider>
  );
  return { vorlagen, addPage, onClose };
}

const tiles = () => screen.getAllByRole('button', { name: /^Seite „.*“ hinzufügen$/ });

describe('Grünerator page picker: Passende Vorlagen', () => {
  it('opens the picker from „+" on a freeform deck and a slider, not on a slide deck', () => {
    const opens = registered.shell?.pagePicker?.quickAddOpensPicker;
    const deck = (configId: string): HeterogeneousPage[] => [{ id: 'p', configId, state: {} }];
    expect(opens?.(deck('freeform'))).toBe(true);
    expect(opens?.(deck('freeform-gj-at'))).toBe(true);
    expect(opens?.(deck('slider'))).toBe(true);
    expect(opens?.(deck('slide-layout'))).toBe(false);
  });

  it('suggests the Seiten most like the design first, without title slides', async () => {
    setup();
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(tiles().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Seite „Tanne“ hinzufügen',
      'Seite „Mint“ hinzufügen',
    ]);
    // Leere Seite und Duplizieren bleiben.
    expect(screen.getByRole('button', { name: /Leere Seite/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aktuelle Seite duplizieren/ })).toBeTruthy();
  });

  it('appends the picked Seite to the deck’s carousel and closes', async () => {
    const { vorlagen, addPage, onClose } = setup();
    await waitFor(() => expect(tiles()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Seite „Tanne“ hinzufügen' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(vorlagen.composeSeite).toHaveBeenCalledWith(SEITEN[1], 'post-portrait');
    expect(addPage).toHaveBeenCalledWith('freeform', false, {
      title: 'Seite',
      [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'karussell', slide: {} },
    });
  });

  it('says so and stays open when the Seite cannot be placed', async () => {
    const { addPage, onClose } = setup(
      {},
      { composeSeite: vi.fn(() => Promise.reject(new Error('fonts'))) }
    );
    await waitFor(() => expect(tiles()).toHaveLength(2));

    fireEvent.click(tiles()[0]!);

    expect((await screen.findByRole('alert')).textContent).toContain('ließ sich nicht einfügen');
    expect(addPage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops a pick that finishes after the picker closed', async () => {
    let finish: (pages: VorlagePage[]) => void = () => {};
    const { addPage, onClose } = setup(
      {},
      {
        composeSeite: vi.fn(
          () =>
            new Promise<VorlagePage[]>((resolve) => {
              finish = resolve;
            })
        ),
      }
    );
    await waitFor(() => expect(tiles()).toHaveLength(2));

    fireEvent.click(tiles()[0]!);
    fireEvent.keyDown(document, { key: 'Escape' });
    finish([COMPOSED]);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(addPage).not.toHaveBeenCalled();
  });

  it('suggests nothing on a print format', () => {
    const { vorlagen } = setup({ formatId: 'print-a3-hoch' });
    expect(screen.queryByRole('region', { name: 'Passende Vorlagen' })).toBeNull();
    expect(vorlagen.listSeiten).not.toHaveBeenCalled();
  });

  describe('Mit KI hinzufügen', () => {
    const DECK = 'Seite 1:\nWeitere Texte: p1\n\nSeite 2:\nWeitere Texte: p2';
    const aiButton = () => screen.getByRole('button', { name: 'Mit KI hinzufügen' });

    it('hands the fitting Seiten and the design’s text to the host and appends its page', async () => {
      const draftNextSeite = vi.fn(() => Promise.resolve({ seite: SEITEN[0]!, pages: [COMPOSED] }));
      const { addPage, onClose } = setup({}, { draftNextSeite });
      await waitFor(() => expect(tiles()).toHaveLength(2));

      fireEvent.click(aiButton());

      expect(
        await screen.findByRole('button', { name: 'Passende Seite wird erstellt …' })
      ).toBeTruthy();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(draftNextSeite).toHaveBeenCalledWith({
        candidates: [SEITEN[1], SEITEN[0]],
        deck: DECK,
        format: 'post-portrait',
        brand: 'gruene',
      });
      expect(addPage).toHaveBeenCalledWith('freeform', false, {
        title: 'Seite',
        [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'karussell', slide: {} },
      });
    });

    it('keeps everything else waiting while the page is written', async () => {
      setup({}, { draftNextSeite: vi.fn(() => new Promise<never>(() => {})) });
      await waitFor(() => expect(tiles()).toHaveLength(2));

      fireEvent.click(aiButton());

      await waitFor(() =>
        expect(
          (screen.getByRole('button', { name: /Aktuelle Seite duplizieren/ }) as HTMLButtonElement)
            .disabled
        ).toBe(true)
      );
      expect(tiles().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });

    it('says so and stays open when the host cannot write the page', async () => {
      const { addPage, onClose } = setup(
        {},
        { draftNextSeite: vi.fn(() => Promise.reject(new Error('502'))) }
      );
      await waitFor(() => expect(tiles()).toHaveLength(2));

      fireEvent.click(aiButton());

      expect((await screen.findByRole('alert')).textContent).toContain('KI-Seite');
      expect(addPage).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('is not offered without the host’s AI', async () => {
      setup({}, {});
      await waitFor(() => expect(tiles()).toHaveLength(2));
      expect(screen.queryByRole('button', { name: 'Mit KI hinzufügen' })).toBeNull();
    });

    it('is not offered on a design without text', async () => {
      setup(
        { pages: [{ id: 'p1', configId: 'freeform', state: { backgroundColor: '#005538' } }] },
        { draftNextSeite: vi.fn() }
      );
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));
      expect(screen.queryByRole('button', { name: 'Mit KI hinzufügen' })).toBeNull();
    });
  });

  describe('Vorlage ändern: the page keeps its text', () => {
    const PAGE = page('p1', 'tanne', 'karussell');
    const restyle = (service: Partial<CanvasVorlagenService>, state = PAGE.state) =>
      setup({ mode: 'replace', currentState: state }, service);
    const restyleTiles = () => screen.getAllByRole('button', { name: /^Seite „.*“ übernehmen$/ });

    it('writes the page’s text into the picked Seite and puts it in the page’s place', async () => {
      const fillSeite = vi.fn(() => Promise.resolve([COMPOSED]));
      const onSelectTemplate = vi.fn();
      const { vorlagen } = setup(
        { mode: 'replace', currentState: PAGE.state, onSelectTemplate },
        { fillSeite }
      );
      expect(
        await screen.findByRole('region', { name: 'Seite umgestalten – dein Text bleibt' })
      ).toBeTruthy();
      // A restyle may make the page a title page.
      await waitFor(() => expect(restyleTiles()).toHaveLength(3));

      fireEvent.click(screen.getByRole('button', { name: 'Seite „Mint“ übernehmen' }));

      await waitFor(() => expect(onSelectTemplate).toHaveBeenCalled());
      expect(fillSeite).toHaveBeenCalledWith(SEITEN[0], 'post-portrait', 'Weitere Texte: p1');
      expect(vorlagen.composeSeite).not.toHaveBeenCalled();
      expect(onSelectTemplate).toHaveBeenCalledWith('freeform', {
        title: 'Seite',
        [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'karussell', slide: {} },
      });
    });

    it('takes the Seite as it is on a page without text', async () => {
      const fillSeite = vi.fn();
      const onSelectTemplate = vi.fn();
      const { vorlagen } = setup(
        { mode: 'replace', currentState: { backgroundColor: '#005538' }, onSelectTemplate },
        { fillSeite }
      );
      await waitFor(() => expect(restyleTiles()).toHaveLength(3));

      fireEvent.click(restyleTiles()[0]!);

      await waitFor(() => expect(onSelectTemplate).toHaveBeenCalled());
      expect(fillSeite).not.toHaveBeenCalled();
      expect(vorlagen.composeSeite).toHaveBeenCalled();
    });

    it('keeps the page when its text cannot be carried over', async () => {
      const onSelectTemplate = vi.fn();
      setup(
        { mode: 'replace', currentState: PAGE.state, onSelectTemplate },
        { fillSeite: vi.fn(() => Promise.reject(new Error('draft'))) }
      );
      await waitFor(() => expect(restyleTiles()).toHaveLength(3));

      fireEvent.click(restyleTiles()[0]!);

      expect((await screen.findByRole('alert')).textContent).toContain('nicht übertragen');
      expect(onSelectTemplate).not.toHaveBeenCalled();
    });

    it('offers no Seiten for a page with text when the host cannot carry text', () => {
      const { vorlagen } = restyle({});
      expect(screen.queryByRole('region', { name: /Seite umgestalten/ })).toBeNull();
      expect(vorlagen.listSeiten).not.toHaveBeenCalled();
    });
  });

  it('has no axe violations', async () => {
    setup();
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const flyout = screen
      .getByRole('heading', { name: 'Seite hinzufügen' })
      .closest('.fixed, [style]');
    expect(await axe(flyout as HTMLElement)).toHaveNoViolations();
  });
});
