import { describe, expect, it } from 'vitest';

import { SHAREPIC_COLOR_HEX } from '../composer/chromeParts';

import { colorSimilarity, rankVorlagen, vorlagenForFormat } from './vorlagenRelevance';

import type { SharepicColor, SharepicFormat } from '@gruenerator/contracts';

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

describe('vorlagenForFormat', () => {
  const list = [
    vorlage('ohne-format', [farbe('tanne')]),
    vorlage('hochkant', [farbe('tanne')], 'post-portrait'),
    vorlage('hoch', [farbe('tanne')], 'post-portrait-tall'),
  ];

  it('treats a spec without format as 4:5', () => {
    expect(ids(vorlagenForFormat(list, 'post-portrait'))).toEqual(['ohne-format', 'hochkant']);
  });

  it('offers 3:4 Vorlagen only on a 3:4 design', () => {
    expect(ids(vorlagenForFormat(list, 'post-portrait-tall'))).toEqual(['hoch']);
  });

  it('has nothing for a format without Vorlagen', () => {
    expect(vorlagenForFormat(list, 'profile-square')).toEqual([]);
  });
});

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
