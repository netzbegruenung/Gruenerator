import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { beforeAll, describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE } from '../../brand/theme';
import { getAllTemplates } from '../../utils/templateRegistry';

import type { AnyCanvasConfig } from '@ggraphic/editor/configs/types';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';

/**
 * A NEW element takes its defaults from the document's brand, not from the
 * first registered pack. apps/web registers `[GRUENE_DE, GRUENE_AT]`, so
 * `activeBrand()` is always the German pack: an Austrian canvas used to add
 * its header in GrueneTypeNeue. The tests register nothing, which is the
 * point: the document's pack has to come from its config.
 */

type State = Record<string, unknown> & {
  additionalTexts: { type: string; fontFamily?: string }[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  frameInstances: FrameInstance[];
  shapeInstances: ShapeInstance[];
};

type Actions = Record<string, (...args: never[]) => void> & {
  addHeader: () => void;
  addSubheader: () => void;
  addText: () => void;
  addPillBadge: (preset?: string) => void;
  addCircleBadge: (preset?: string) => void;
  addFrame: (clipType: string) => void;
  addShape: (type: string) => void;
};

/** Real actions over a recorded state; the AT configs start from `{}`. */
function drive(config: AnyCanvasConfig) {
  let state = config.createInitialState({}) as State;
  const actions = config.createActions(
    () => state,
    (partial) => {
      state = typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
    },
    () => undefined,
    () => undefined,
    {}
  ) as unknown as Actions;
  return { actions, state: () => state };
}

/** Every Austrian template: a new `*-at` sujet is covered the moment it is registered. */
const AT_IDS = getAllTemplates()
  .filter((template) => template.audience === 'de-AT')
  .map((template) => template.id);

describe.each([
  ['freeform', GRUENE_DE],
  ['freeform-at', GRUENE_AT],
] as const)('new elements in %s', (id, pack) => {
  let config: AnyCanvasConfig;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  it('adds header, subheader and body text in the pack fonts', () => {
    const { actions, state } = drive(config);
    actions.addHeader();
    actions.addSubheader();
    actions.addText();
    const fonts = Object.fromEntries(state().additionalTexts.map((t) => [t.type, t.fontFamily]));
    expect(fonts.header).toBe(`${pack.fonts.headline}, Arial, sans-serif`);
    expect(fonts.subheader).toBe(`${pack.fonts.headline}, Arial, sans-serif`);
    expect(fonts.body).toBe(`${pack.fonts.body}, Arial, sans-serif`);
  });

  it('adds a pill badge in the pack colours and headline font', () => {
    const { actions, state } = drive(config);
    actions.addPillBadge();
    actions.addPillBadge('slider-inverted');
    const [pill, inverted] = state().pillBadgeInstances;
    expect(pill).toMatchObject({
      fontFamily: pack.fonts.headline,
      backgroundColor: pack.colors.primary,
    });
    expect(inverted).toMatchObject({
      fontFamily: pack.fonts.headline,
      backgroundColor: pack.colors.surface,
      textColor: pack.colors.primary,
    });
  });

  it('adds a circle badge in the pack colours and headline font', () => {
    const { actions, state } = drive(config);
    actions.addCircleBadge();
    actions.addCircleBadge('default-inverted');
    const [circle, inverted] = state().circleBadgeInstances;
    expect(circle.backgroundColor).toBe(pack.colors.primary);
    expect(circle.textLines[0].fontFamily).toBe(pack.fonts.headline);
    expect(inverted).toMatchObject({
      backgroundColor: pack.colors.surface,
      textColor: pack.colors.primary,
    });
    expect(inverted.textLines[0].fontFamily).toBe(pack.fonts.headline);
  });

  it('adds frames, shapes and marker shapes in the pack colours', () => {
    const { actions, state } = drive(config);
    actions.addFrame('square');
    actions.addShape('rect');
    actions.addShape('hand-marker');
    expect(state().frameInstances[0].borderColor).toBe(pack.colors.primary);
    expect(state().shapeInstances[0].fill).toBe(pack.palette[0].color);
    expect(state().shapeInstances[1].fill).toBe(pack.markers.swatches[0].color);
  });
});

describe('the Austrian templates', () => {
  it('are found in the registry', () => {
    // An empty list would run no case below and pass.
    expect(AT_IDS).toEqual(expect.arrayContaining(['freeform-at', 'zitat-at', 'slider-at']));
  });
});

describe.each(AT_IDS)('%s', (id) => {
  let config: AnyCanvasConfig;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  it('carries the Austrian pack', () => {
    expect(config.brand).toBe(GRUENE_AT);
  });

  it('adds text in the Austrian fonts', () => {
    const { actions, state } = drive(config);
    actions.addHeader();
    actions.addText();
    const [header, body] = state().additionalTexts.slice(-2);
    expect(header.fontFamily).toBe('GothamNarrow-Ultra, Arial, sans-serif');
    expect(body.fontFamily).toBe('GothamNarrow-Book, Arial, sans-serif');
  });
});

describe('the German templates', () => {
  it.each(['freeform', 'zitat', 'dreizeilen'] as const)(
    '%s names no pack of its own',
    async (id) => {
      const config = await loadCanvasConfig(id);
      expect(config.brand).toBeUndefined();
    }
  );
});
