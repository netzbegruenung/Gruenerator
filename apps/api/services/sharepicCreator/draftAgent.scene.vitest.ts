import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic, takeScene } from './draftAgent.js';
import { calmBox, sceneLayout, type ScenePainter } from './sceneBackground.js';

const needs = { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [] };
const MOTIV = 'Rooftop solar panels over a small German town at golden hour';
const REF = 'ki:abcdefghijklmnop1234';

const slide = (background: Record<string, unknown>) => ({
  background,
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: ['Mehr Sonne', 'auf jedes Dach'] }],
  logo: false,
});

/** The draft step answers with `raw`, run through the agent's own validation. */
function draftAnswers(...raws: unknown[]) {
  aiObject.mockReset();
  aiObject.mockResolvedValueOnce({ ok: true, data: needs });
  const errors: string[] = [];
  aiObject.mockImplementationOnce(
    async (opts: {
      validate: (i: unknown) => { ok: boolean; value?: unknown; error?: string };
    }) => {
      for (const raw of raws) {
        const checked = opts.validate(raw);
        if (checked.ok) return { ok: true, data: checked.value };
        errors.push(checked.error!);
      }
      return { ok: false, error: errors.join(' | ') };
    }
  );
  return errors;
}

describe('takeScene', () => {
  it('swaps the scene for a placeholder photo and keeps its motive', () => {
    const taken = takeScene({
      slides: [slide({ kind: 'szene', motiv: MOTIV, textSeite: 'unten' })],
    });
    expect(taken).toMatchObject({ ok: true, scene: { slide: 0, motiv: MOTIV } });
  });

  it('allows one scene per draft', () => {
    const scene = { kind: 'szene', motiv: MOTIV, textSeite: 'unten' };
    expect(takeScene({ slides: [slide(scene), slide(scene)] }).ok).toBe(false);
  });

  it('needs a motive', () => {
    expect(takeScene({ slides: [slide({ kind: 'szene', textSeite: 'unten' })] }).ok).toBe(false);
  });
});

describe('sceneLayout', () => {
  it('leaves the text side calm and puts the subject on the other side', () => {
    const layout = sceneLayout(MOTIV, 'unten');
    expect(layout.rows.find((r) => r.id === 'ruhe')!.bbox).toEqual(calmBox('unten'));
    expect(layout.rows.find((r) => r.id === 'motiv')!.bbox).toEqual([0, 0, 380, 1000]);
    expect(layout.caption).toContain('No text, letters, numbers');
  });
});

describe('draftSharepic — painted scene', () => {
  it('paints the scene and sets it as a photo', async () => {
    draftAnswers({ slides: [slide({ kind: 'szene', motiv: MOTIV, textSeite: 'unten' })] });
    const paint = vi.fn<ScenePainter>().mockResolvedValue({ ok: true, ref: REF });

    const draft = await draftSharepic('Faktenbild: Solar auf jedes Dach', 'de-DE', null, [], {
      scene: paint,
    });

    expect(paint).toHaveBeenCalledWith({ motiv: MOTIV, textSeite: 'unten', format: undefined });
    expect(draft.spec.slides[0]!.background).toEqual({
      kind: 'foto',
      filename: REF,
      textSeite: 'unten',
    });
    expect(draft.attributions).toEqual([null]);
    expect(draft.hinweis).toBeUndefined();
  });

  it('falls back to the brand colour and says why when painting fails', async () => {
    draftAnswers({ slides: [slide({ kind: 'szene', motiv: MOTIV, textSeite: 'unten' })] });
    const paint = vi
      .fn<ScenePainter>()
      .mockResolvedValue({ ok: false, hinweis: 'Bäume sind aufgebraucht.' });

    const draft = await draftSharepic('Faktenbild: Solar auf jedes Dach', 'de-DE', null, [], {
      scene: paint,
    });

    expect(draft.spec.slides[0]!.background).toEqual({ kind: 'farbe', color: 'tanne' });
    expect(draft.spec.slides[0]!.position).toBe('mitte');
    expect(draft.hinweis).toBe('Bäume sind aufgebraucht.');
  });

  it('sends a Faktenbild without a scene back for one', async () => {
    const errors = draftAnswers(
      { slides: [slide({ kind: 'farbe', color: 'tanne' })] },
      { slides: [slide({ kind: 'szene', motiv: MOTIV, textSeite: 'unten' })] }
    );
    const paint = vi.fn<ScenePainter>().mockResolvedValue({ ok: true, ref: REF });

    await draftSharepic('Mach ein Faktenbild zum Solarausbau', 'de-DE', null, [], { scene: paint });

    expect(errors[0]).toContain('Faktenbild');
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('keeps a scene painted earlier through a revision, without painting again', async () => {
    const current: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        {
          background: { kind: 'foto', filename: REF, textSeite: 'unten' },
          position: 'unten',
          align: 'links',
          items: [{ type: 'headline', lines: ['Mehr Sonne', 'auf jedes Dach'] }],
          logo: false,
        },
      ],
    };
    draftAnswers({ slides: [slide({ kind: 'foto', filename: REF, textSeite: 'unten' })] });
    const paint = vi.fn<ScenePainter>();

    const draft = await draftSharepic('Headline kürzer', 'de-DE', current, [], { scene: paint });

    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: REF });
    expect(paint).not.toHaveBeenCalled();
  });

  it('rejects a scene ref this draft never painted', async () => {
    const errors = draftAnswers({
      slides: [slide({ kind: 'foto', filename: REF, textSeite: 'unten' })],
    });

    await expect(draftSharepic('Solar auf jedes Dach', 'de-DE', null, [], {})).rejects.toThrow();
    expect(errors[0]).toContain('gibt es nicht');
  });
});

describe('draftSharepic — infographic', () => {
  const punkte = [
    { titel: 'Nimm das Rad', icon: 'fahrrad', motiv: 'a city bicycle with a basket' },
    { titel: 'Eigener Becher', icon: 'essen', motiv: 'a reusable coffee cup' },
  ];
  const infoSlide = (items: unknown[]) => ({
    background: { kind: 'farbe', color: 'hellgrau' },
    position: 'oben',
    align: 'zentriert',
    items: [{ type: 'headline', lines: ['Nachhaltiger', 'leben'] }, ...items],
    logo: false,
  });

  it('sends an infographic brief back until it has an infografik item', async () => {
    const errors = draftAnswers(
      { slides: [slide({ kind: 'farbe', color: 'tanne' })] },
      { slides: [infoSlide([{ type: 'infografik', form: 'raster', punkte }])] }
    );
    const illustrations = vi.fn().mockResolvedValue({ refs: [REF, null], hinweis: null });

    const draft = await draftSharepic('Mach eine Infografik: zwei Tipps', 'de-DE', null, [], {
      illustrations,
    });

    expect(errors[0]).toContain('infografik');
    expect(illustrations).toHaveBeenCalledWith(
      ['a city bicycle with a basket', 'a reusable coffee cup'],
      'de-DE'
    );
    const item = draft.spec.slides[0]!.items[1];
    expect(item).toMatchObject({ type: 'infografik' });
    // Painted where it worked; the icon stands in where it did not.
    expect(item?.type === 'infografik' && item.punkte.map((p) => p.bild)).toEqual([REF, undefined]);
  });

  it('paints a quantity comparison once and stands it at every point', async () => {
    draftAnswers({
      slides: [
        infoSlide([
          {
            type: 'infografik',
            form: 'mengen',
            punkte: [
              { titel: '4 kg', icon: 'bahn', motiv: 'a dark green cloud', wert: 4 },
              { titel: '85 kg', icon: 'flugzeug', motiv: 'an aeroplane', wert: 85 },
            ],
          },
        ]),
      ],
    });
    const illustrations = vi.fn().mockResolvedValue({ refs: [REF], hinweis: null });

    const draft = await draftSharepic('Infografik: Zug 4 kg, Flug 85 kg CO2', 'de-DE', null, [], {
      illustrations,
    });

    expect(illustrations).toHaveBeenCalledWith(['a dark green cloud'], 'de-DE');
    const item = draft.spec.slides[0]!.items[1];
    expect(item?.type === 'infografik' && item.punkte.map((p) => p.bild)).toEqual([REF, REF]);
  });

  it('keeps the icons and says why when there is no painter', async () => {
    draftAnswers({ slides: [infoSlide([{ type: 'infografik', form: 'raster', punkte }])] });

    const draft = await draftSharepic('Infografik: zwei Tipps', 'de-DE', null, [], {});

    const item = draft.spec.slides[0]!.items[1];
    expect(item?.type === 'infografik' && item.punkte.every((p) => !p.bild)).toBe(true);
  });

  it('rejects a quantity that is not in the brief, and a bild the model wrote itself', async () => {
    const errors = draftAnswers({
      slides: [
        infoSlide([
          {
            type: 'infografik',
            form: 'mengen',
            punkte: [
              { titel: 'Bau', icon: 'muell', motiv: 'a full rubbish bag', wert: 336 },
              { titel: 'Autos', icon: 'auto', motiv: 'a rubbish bag', wert: 99, bild: REF },
            ],
          },
        ]),
      ],
    });

    await expect(
      draftSharepic('Infografik: Bau 336 Tausend Tonnen, Autos 86', 'de-DE', null, [], {})
    ).rejects.toThrow();
    expect(errors[0]).toContain('99');
    expect(errors[0]).toContain('bild schreibt der Grünerator selbst');
  });

  it('sends an infographic on a green slide back to a light ground', async () => {
    const errors = draftAnswers(
      {
        slides: [
          {
            ...infoSlide([{ type: 'infografik', form: 'raster', punkte }]),
            background: { kind: 'farbe', color: 'tanne' },
          },
        ],
      },
      { slides: [infoSlide([{ type: 'infografik', form: 'raster', punkte }])] }
    );

    const draft = await draftSharepic('Infografik: zwei Tipps', 'de-DE', null, [], {});

    expect(errors[0]).toContain('hellem Grund');
    expect(draft.spec.slides[0]!.background).toEqual({ kind: 'farbe', color: 'hellgrau' });
  });

  it('counts a spelled-out share without painting anything', async () => {
    const errors = draftAnswers({
      slides: [
        infoSlide([
          {
            type: 'infografik',
            form: 'anteil',
            punkte: [
              { titel: '9 von 10', text: 'wollen kein Mercosur', icon: 'person', wert: 9, von: 10 },
            ],
          },
        ]),
      ],
    });
    const illustrations = vi.fn();

    const draft = await draftSharepic(
      'Infografik: Neun von zehn Österreicher:innen wollen kein Mercosur-Abkommen.',
      'de-DE',
      null,
      [],
      { illustrations }
    );

    expect(errors).toEqual([]);
    expect(illustrations).not.toHaveBeenCalled();
    expect(draft.spec.slides[0]!.items[1]).toMatchObject({ form: 'anteil' });
  });

  const share = (titel: string, wert: number, von: number) => ({
    slides: [
      infoSlide([
        { type: 'infografik', form: 'anteil', punkte: [{ titel, icon: 'bus', wert, von }] },
      ]),
    ],
  });

  it('takes a percentage as a share of 100', async () => {
    const errors = draftAnswers(share('37 %', 37, 100));

    await draftSharepic(
      'Infografik: 37 % der Gemeinden haben keinen Bus am Wochenende.',
      'de-DE',
      null,
      [],
      {}
    );

    expect(errors).toEqual([]);
  });

  it('rejects a whole the brief does not name', async () => {
    const errors = draftAnswers(share('7 von 10', 7, 10));

    await expect(
      draftSharepic(
        'Infografik: In 7 Gemeinden fährt am Wochenende kein Bus.',
        'de-DE',
        null,
        [],
        {}
      )
    ).rejects.toThrow();
    expect(errors[0]).toContain('von 10 (7 von 10) steht nicht im Auftrag');
  });

  it('checks the numbers in a fact check like any text', async () => {
    const errors = draftAnswers({
      slides: [
        {
          ...infoSlide([]),
          items: [
            { type: 'headline', lines: ['Faktencheck'] },
            {
              type: 'faktencheck',
              paare: [{ mythos: 'Jede Heizung muss raus.', fakt: '80 % dürfen bleiben.' }],
            },
          ],
        },
      ],
    });

    await expect(
      draftSharepic(
        'Faktencheck: Mythos – jede Heizung muss raus. Fakt – die meisten dürfen bleiben.',
        'de-DE',
        null,
        [],
        {}
      )
    ).rejects.toThrow();
    expect(errors[0]).toContain('80');
  });

  it('lets spelled numbers license a share, never a headline', async () => {
    const errors = draftAnswers({
      slides: [
        {
          ...infoSlide([]),
          items: [{ type: 'headline', lines: ['1 Million Bäume', 'jeden Tag'] }],
        },
      ],
    });

    await expect(
      draftSharepic('Sharepic: Jeden Tag pflanzen wir Bäume.', 'de-DE', null, [], {})
    ).rejects.toThrow();
    expect(errors[0]).toContain('nennt 1');
  });

  it('takes „ein Drittel“ as one of three', async () => {
    const errors = draftAnswers({
      slides: [
        infoSlide([
          {
            type: 'infografik',
            form: 'anteil',
            punkte: [
              { titel: '1 von 3', text: 'Gemeinden ohne Bus', icon: 'bus', wert: 1, von: 3 },
            ],
          },
        ]),
      ],
    });

    await draftSharepic(
      'Infografik: Ein Drittel der Gemeinden hat keinen Bus.',
      'de-DE',
      null,
      [],
      {}
    );

    expect(errors).toEqual([]);
  });

  it('rejects a share whose title says another figure than it draws', async () => {
    const errors = draftAnswers({
      slides: [
        infoSlide([
          {
            type: 'infografik',
            form: 'anteil',
            punkte: [{ titel: '9 von 10', icon: 'person', wert: 8, von: 10 }],
          },
        ]),
      ],
    });

    await expect(
      draftSharepic('Infografik: 9 von 10, nein 8 von 10 sind dafür.', 'de-DE', null, [], {})
    ).rejects.toThrow();
    expect(errors[0]).toContain('passt nicht zu wert 8 von 10');
  });

  it('rejects a fact the brief does not give', async () => {
    const errors = draftAnswers({
      slides: [
        {
          ...infoSlide([]),
          items: [
            { type: 'headline', lines: ['Faktencheck'] },
            {
              type: 'faktencheck',
              paare: [
                {
                  mythos: 'Windräder töten massenhaft Vögel.',
                  fakt: 'Moderne Anlagen schalten bei Vogelzug automatisch ab.',
                },
              ],
            },
          ],
        },
      ],
    });

    await expect(
      draftSharepic(
        'Faktencheck: Mythos – Windräder töten massenhaft Vögel. Fakt – Glasfassaden und Verkehr töten weit mehr Vögel.',
        'de-DE',
        null,
        [],
        {}
      )
    ).rejects.toThrow();
    expect(errors[0]).toContain('stützt sich nicht auf den Auftrag');
  });

  it('rejects a source line the brief does not name', async () => {
    const errors = draftAnswers({
      slides: [
        { ...infoSlide([{ type: 'infografik', form: 'raster', punkte }]), quelle: 'Auftrag' },
      ],
    });

    await expect(draftSharepic('Infografik: zwei Tipps', 'de-DE', null, [], {})).rejects.toThrow();
    expect(errors[0]).toContain('Die Quelle "Auftrag" steht nicht im Auftrag');
  });
});
