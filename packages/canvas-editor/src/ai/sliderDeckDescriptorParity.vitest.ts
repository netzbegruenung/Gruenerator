import { describe, it, expect } from 'vitest';

import {
  buildSliderDeckSnapshotLines,
  getSharepicTemplateDescriptor,
  sliderDeckOpsToPagePatches,
  type SliderDeckOperation,
  type SliderDeckPage,
} from '@gruenerator/contracts';

import { sliderFullConfig } from '../configs/slider_full.config';
import { getPillBadgeColorsForScheme } from '../utils/pillBadgeUtils';
import { getSliderColors } from '../utils/sliderLayout';

const descriptor = getSharepicTemplateDescriptor('slider')!;

// The server-safe slider descriptor in @gruenerator/contracts duplicates the
// editable surface of slider_full.config.tsx (API cannot import .tsx configs).
describe('slider deck descriptor parity', () => {
  it('exists and is the only deck descriptor', () => {
    expect(descriptor).not.toBeNull();
    expect(descriptor.deck).toBeDefined();
    for (const type of ['dreizeilen', 'zitat-pure', 'info']) {
      expect(getSharepicTemplateDescriptor(type)?.deck).toBeUndefined();
    }
  });

  it('canvas dimensions match the config', () => {
    expect(descriptor.canvas).toEqual(sliderFullConfig.canvas);
  });

  it('color scheme ids match the config AI capabilities', () => {
    expect(descriptor.colorSchemes?.options.map((o) => o.id)).toEqual(
      sliderFullConfig.ai?.colorSchemes?.map((s) => s.id)
    );
  });

  it('scheme colors match getSliderColors + getPillBadgeColorsForScheme', () => {
    for (const schemeId of ['sand-tanne', 'tanne-sand'] as const) {
      const expected = getSliderColors(schemeId);
      const pill = getPillBadgeColorsForScheme(schemeId);
      expect(descriptor.deck!.schemeColors[schemeId]).toEqual({
        background: expected.background,
        pillBackground: pill.backgroundColor,
        pillText: pill.textColor,
        arrow: expected.arrowFill,
      });
    }
  });

  it('deck limits match the multiPage config', () => {
    expect(descriptor.deck!.maxSlides).toBe(sliderFullConfig.multiPage?.maxPages);
    expect(descriptor.deck!.defaultNewSlideState.slideVariant).toBe(
      sliderFullConfig.multiPage?.defaultNewPageState?.slideVariant
    );
  });

  it('text field state keys exist in the config initial state', () => {
    const state = sliderFullConfig.createInitialState({}) as Record<string, unknown>;
    for (const f of descriptor.textFields) {
      expect(f.stateKey in state, f.stateKey).toBe(true);
      if (f.fontSize) expect(f.fontSize.stateKey in state, f.fontSize.stateKey).toBe(true);
    }
    expect(descriptor.colorSchemes!.stateKey in state).toBe(true);
  });
});

const makeDeck = (): SliderDeckPage[] => [
  {
    id: 'page-1',
    configId: 'slider',
    state: {
      label: 'Wusstest du?',
      headline: 'Cover-Headline',
      subtext: 'Cover-Subtext',
      subtext2: '',
      slideVariant: 'cover',
      colorScheme: 'sand-tanne',
      backgroundColor: '#F5F1E9',
      pillBadgeInstances: [
        { id: 'pill-1', text: 'Wusstest du?', backgroundColor: '#005538', textColor: '#FFFFFF' },
      ],
      iconStates: { 'hi-chevronright': { x: 900, y: 1200, color: '#005538' } },
    },
  },
  {
    id: 'page-2',
    configId: 'slider',
    state: {
      label: '',
      headline: 'Fakt 1',
      subtext: 'Inhalt 1',
      subtext2: 'Quelle 1',
      slideVariant: 'content',
      colorScheme: 'sand-tanne',
    },
  },
  {
    id: 'page-3',
    configId: 'slider',
    state: {
      label: '',
      headline: 'Fakt 2',
      subtext: 'Inhalt 2',
      subtext2: '',
      slideVariant: 'content',
      colorScheme: 'sand-tanne',
    },
  },
  {
    id: 'page-4',
    configId: 'slider',
    state: {
      label: '',
      headline: 'Mehr dazu',
      subtext: 'gruene.de',
      subtext2: '',
      slideVariant: 'last',
      colorScheme: 'sand-tanne',
    },
  },
];

describe('sliderDeckOpsToPagePatches', () => {
  it('edit-slide patches only the targeted page', () => {
    const ops: SliderDeckOperation[] = [
      {
        kind: 'edit-slide',
        slide: 2,
        operations: [{ kind: 'set-text', field: 'headline', label: 'Headline', value: 'Neu' }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.pagePatches).toEqual([{ pageId: 'page-2', patch: { headline: 'Neu' } }]);
    expect(result.pageOps).toHaveLength(0);
    expect(result.newPages[1].state.headline).toBe('Neu');
    expect(result.newPages[0].state.headline).toBe('Cover-Headline');
  });

  it('clamps font sizes via the shared single-page interpreter', () => {
    const ops: SliderDeckOperation[] = [
      {
        kind: 'edit-slide',
        slide: 2,
        operations: [{ kind: 'set-font-size', field: 'headline', label: 'Headline', size: 500 }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.pagePatches[0].patch.customHeadlineFontSize).toBe(150);
  });

  it('expands set-color-scheme deck-wide with derived colors', () => {
    const ops: SliderDeckOperation[] = [
      {
        kind: 'edit-slide',
        slide: 3,
        operations: [{ kind: 'set-color-scheme', schemeId: 'tanne-sand' }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.pagePatches).toHaveLength(4);
    for (const { patch } of result.pagePatches) {
      expect(patch.colorScheme).toBe('tanne-sand');
      expect(patch.backgroundColor).toBe('#005538');
    }
    const coverPatch = result.pagePatches.find((p) => p.pageId === 'page-1')!.patch;
    expect((coverPatch.pillBadgeInstances as Array<{ backgroundColor: string }>)[0]).toMatchObject({
      backgroundColor: '#F5F1E9',
      textColor: '#005538',
      text: 'Wusstest du?',
    });
    expect(
      (coverPatch.iconStates as Record<string, { color: string }>)['hi-chevronright'].color
    ).toBe('#F5F1E9');
  });

  it('keeps the cover pill text in sync when the label changes', () => {
    const ops: SliderDeckOperation[] = [
      {
        kind: 'edit-slide',
        slide: 1,
        operations: [{ kind: 'set-text', field: 'label', label: 'Label', value: 'Schon gewusst?' }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    const patch = result.pagePatches[0].patch;
    expect(patch.label).toBe('Schon gewusst?');
    expect((patch.pillBadgeInstances as Array<{ text: string }>)[0].text).toBe('Schon gewusst?');
  });

  it('add-slide inserts before the closing slide and inherits the scheme', () => {
    const ops: SliderDeckOperation[] = [
      { kind: 'add-slide', headline: 'Fakt 3', subtext: 'Inhalt 3' },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.pageOps).toHaveLength(1);
    const add = result.pageOps[0];
    if (add.op !== 'add') throw new Error('expected add op');
    expect(add.index).toBe(3);
    expect(add.page.state).toMatchObject({
      headline: 'Fakt 3',
      slideVariant: 'content',
      colorScheme: 'sand-tanne',
      backgroundColor: '#F5F1E9',
    });
    expect(result.newPages.map((p) => p.state.headline)).toEqual([
      'Cover-Headline',
      'Fakt 1',
      'Fakt 2',
      'Fakt 3',
      'Mehr dazu',
    ]);
  });

  it('folds edits to a freshly added slide into the add op', () => {
    const ops: SliderDeckOperation[] = [
      { kind: 'add-slide', headline: 'Fakt 3' },
      {
        kind: 'edit-slide',
        slide: 4,
        operations: [{ kind: 'set-text', field: 'subtext', label: 'Untertext', value: 'Spät' }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.pagePatches).toHaveLength(0);
    const add = result.pageOps[0];
    if (add.op !== 'add') throw new Error('expected add op');
    expect(add.page.state.subtext).toBe('Spät');
  });

  it('remove-slide rejects cover, closing slide and the minimum', () => {
    const cover = sliderDeckOpsToPagePatches(
      descriptor,
      [{ kind: 'remove-slide', slide: 1 } as never],
      makeDeck()
    );
    expect(cover.rejected).toHaveLength(1);

    const last = sliderDeckOpsToPagePatches(
      descriptor,
      [{ kind: 'remove-slide', slide: 4 }],
      makeDeck()
    );
    expect(last.rejected[0].reason).toContain('Abschluss');

    const three = makeDeck().slice(0, 2).concat(makeDeck()[3]);
    const min = sliderDeckOpsToPagePatches(descriptor, [{ kind: 'remove-slide', slide: 2 }], three);
    expect(min.rejected[0].reason).toContain('Mindestens');

    const ok = sliderDeckOpsToPagePatches(
      descriptor,
      [{ kind: 'remove-slide', slide: 3 }],
      makeDeck()
    );
    expect(ok.pageOps).toEqual([{ op: 'remove', pageId: 'page-3' }]);
    expect(ok.newPages).toHaveLength(3);
  });

  it('rejects per-slide ops the slider does not support', () => {
    const ops: SliderDeckOperation[] = [
      {
        kind: 'edit-slide',
        slide: 2,
        operations: [{ kind: 'toggle-sunflower', visible: false }],
      },
    ];
    const result = sliderDeckOpsToPagePatches(descriptor, ops, makeDeck());
    expect(result.applied).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('buildSliderDeckSnapshotLines', () => {
  it('reports scheme, variants and per-slide texts', () => {
    const lines = buildSliderDeckSnapshotLines(descriptor, makeDeck());
    expect(lines[0]).toContain('4 Slides');
    expect(lines[0]).toContain('sand-tanne');
    expect(lines[1]).toContain('(Cover)');
    expect(lines[1]).toContain('Wusstest du?');
    expect(lines[2]).toContain('(Inhalt)');
    expect(lines[2]).toContain('Quelle 1');
    expect(lines[4]).toContain('(Abschluss)');
    // Cover has no Zusatztext, content slides no Label
    expect(lines[1]).not.toContain('Zusatztext');
    expect(lines[2]).not.toContain('Label');
  });
});
