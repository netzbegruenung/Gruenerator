import { describe, expect, it } from 'vitest';

import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';

import { PRIDE_FLAG_ASSET, SHAREPIC_COLOR_HEX } from '../composer/chromeParts';

import { colorSimilarity, rankVorlagen } from './vorlagenRelevance';

import type { SharepicColor, SharepicFormat, SharepicThema } from '@gruenerator/contracts';

type Background =
  | { kind: 'farbe'; color: SharepicColor }
  | { kind: 'foto'; filename: string; textSeite: 'unten' }
  | { kind: 'foto-oben'; filename: string; panelColor: SharepicColor };

const farbe = (color: SharepicColor): Background => ({ kind: 'farbe', color });
const foto: Background = { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' };

function vorlage(id: string, backgrounds: Background[], format?: SharepicFormat) {
  return {
    id,
    spec: {
      ...(format ? { format } : {}),
      slides: backgrounds.map((background) => ({ background, items: [{ type: 'headline' }] })),
    },
  };
}

const colorPage = (color: SharepicColor) => ({
  configId: 'freeform',
  state: { backgroundMode: 'color', backgroundColor: SHAREPIC_COLOR_HEX[color] },
});
const photoPage = {
  configId: 'freeform',
  state: { backgroundMode: 'image', currentImageSrc: '/foto.jpg', backgroundColor: '#005538' },
};

const ids = (list: { id: string }[]) => list.map((v) => v.id);

describe('colorSimilarity', () => {
  const sim = (a: SharepicColor, b: SharepicColor) =>
    colorSimilarity(SHAREPIC_COLOR_HEX[a], SHAREPIC_COLOR_HEX[b]);

  it('is 1 for the same colour', () => {
    expect(sim('tanne', 'tanne')).toBeCloseTo(1);
  });

  it('keeps the greens together, darkest first', () => {
    expect(sim('tanne', 'dunkeltanne')).toBeGreaterThan(sim('tanne', 'grasgruen'));
    expect(sim('tanne', 'grasgruen')).toBeGreaterThan(sim('tanne', 'mint'));
    expect(sim('tanne', 'mint')).toBeGreaterThan(sim('tanne', 'hellgrau'));
    expect(sim('tanne', 'mint')).toBeGreaterThan(sim('tanne', 'aubergine'));
  });

  it('keeps the light neutrals together', () => {
    expect(sim('hellgrau', 'creme')).toBeGreaterThan(sim('hellgrau', 'mint'));
    expect(sim('hellgrau', 'weiss')).toBeGreaterThan(sim('hellgrau', 'mint'));
    expect(sim('hellgrau', 'mint')).toBeGreaterThan(sim('hellgrau', 'tanne'));
  });

  it('is neutral for something that is no colour', () => {
    expect(colorSimilarity('transparent', SHAREPIC_COLOR_HEX.tanne)).toBe(0.5);
  });
});

describe('rankVorlagen', () => {
  const catalogue = [
    vorlage('hellgrau', [farbe('hellgrau')]),
    vorlage('creme', [farbe('creme')]),
    vorlage('foto', [foto]),
    vorlage('grasgruen', [farbe('grasgruen')]),
    vorlage('dunkeltanne', [farbe('dunkeltanne')]),
    vorlage('mint', [farbe('mint')]),
  ];

  it('puts green Vorlagen first on a mostly green design', () => {
    const order = ids(rankVorlagen(catalogue, [colorPage('tanne'), colorPage('tanne')]));
    expect(order.slice(0, 3)).toEqual(['dunkeltanne', 'grasgruen', 'mint']);
    expect(order.indexOf('mint')).toBeLessThan(order.indexOf('hellgrau'));
  });

  it('puts light Vorlagen first on a light grey design', () => {
    const order = ids(rankVorlagen(catalogue, [colorPage('hellgrau')]));
    expect(order.slice(0, 2).sort()).toEqual(['creme', 'hellgrau']);
  });

  it('follows the colour most pages share', () => {
    const order = ids(
      rankVorlagen(catalogue, [colorPage('hellgrau'), colorPage('tanne'), colorPage('tanne')])
    );
    expect(order[0]).toBe('dunkeltanne');
  });

  it('puts photo Vorlagen first on a design made of photos', () => {
    const order = ids(rankVorlagen(catalogue, [photoPage]));
    expect(order[0]).toBe('foto');
  });

  it('counts a placed picture as a photo page', () => {
    const page = {
      configId: 'freeform',
      state: {
        backgroundMode: 'color',
        backgroundColor: SHAREPIC_COLOR_HEX.hellgrau,
        userImageInstances: [{ id: 'u1' }],
      },
    };
    const withPanel = vorlage('foto-oben', [
      { kind: 'foto-oben', filename: 'x.jpg', panelColor: 'hellgrau' },
    ]);
    const order = ids(rankVorlagen([vorlage('hellgrau', [farbe('hellgrau')]), withPanel], [page]));
    expect(order[0]).toBe('foto-oben');
  });

  it('prefers the Vorlage with as many pages as the design', () => {
    const one = vorlage('eine-seite', [farbe('tanne')]);
    const three = vorlage('drei-seiten', [farbe('tanne'), farbe('tanne'), farbe('tanne')]);
    const pages = [colorPage('tanne'), colorPage('tanne'), colorPage('tanne')];
    expect(ids(rankVorlagen([one, three], pages))).toEqual(['drei-seiten', 'eine-seite']);
  });

  it('keeps the catalogue order between equal Vorlagen', () => {
    const list = [
      vorlage('a', [farbe('tanne')]),
      vorlage('b', [farbe('tanne')]),
      vorlage('c', [farbe('tanne')]),
    ];
    expect(ids(rankVorlagen(list, [colorPage('mint')]))).toEqual(['a', 'b', 'c']);
  });
});

describe('rankVorlagen by theme', () => {
  const themed = (id: string, thema: SharepicThema, color: SharepicColor) => {
    const v = vorlage(id, [farbe(color)]);
    return { ...v, spec: { ...v.spec, thema } };
  };
  const list = [
    vorlage('tanne', [farbe('tanne')]),
    themed('pride', 'queer', 'violett'),
    themed('frauen', 'frauen', 'lila'),
  ];
  /** A composed page: its source spec names the theme. */
  const sourced = (color: SharepicColor, thema: SharepicThema) => ({
    configId: 'freeform',
    state: {
      ...colorPage(color).state,
      [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'd', slide: { locale: 'de-DE', thema, slides: [] } },
    },
  });

  it('lists the own theme first and the other theme last', () => {
    expect(ids(rankVorlagen(list, [sourced('tanne', 'queer')]))).toEqual([
      'pride',
      'tanne',
      'frauen',
    ]);
    expect(ids(rankVorlagen(list, [sourced('tanne', 'frauen')]))).toEqual([
      'frauen',
      'tanne',
      'pride',
    ]);
  });

  it('reads a hand-placed Progress Pride flag as Pride', () => {
    const page = {
      configId: 'freeform',
      state: { ...colorPage('mint').state, assetInstances: [{ assetId: PRIDE_FLAG_ASSET }] },
    };
    expect(ids(rankVorlagen(list, [page]))[0]).toBe('pride');
  });

  it('keeps themed Vorlagen behind plain ones on a plain design of their colour', () => {
    expect(ids(rankVorlagen(list, [colorPage('lila')]))[0]).toBe('tanne');
  });
});
