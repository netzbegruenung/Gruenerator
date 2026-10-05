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

    const draft = await draftSharepic('Infografik: Solar auf jedes Dach', 'de-DE', null, [], paint);

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

    const draft = await draftSharepic('Infografik: Solar auf jedes Dach', 'de-DE', null, [], paint);

    expect(draft.spec.slides[0]!.background).toEqual({ kind: 'farbe', color: 'tanne' });
    expect(draft.spec.slides[0]!.position).toBe('mitte');
    expect(draft.hinweis).toBe('Bäume sind aufgebraucht.');
  });

  it('sends an infographic without a scene back for one', async () => {
    const errors = draftAnswers(
      { slides: [slide({ kind: 'farbe', color: 'tanne' })] },
      { slides: [slide({ kind: 'szene', motiv: MOTIV, textSeite: 'unten' })] }
    );
    const paint = vi.fn<ScenePainter>().mockResolvedValue({ ok: true, ref: REF });

    await draftSharepic('Mach eine Infografik zum Solarausbau', 'de-DE', null, [], paint);

    expect(errors[0]).toContain('Infografik');
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

    const draft = await draftSharepic('Headline kürzer', 'de-DE', current, [], paint);

    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: REF });
    expect(paint).not.toHaveBeenCalled();
  });

  it('rejects a scene ref this draft never painted', async () => {
    const errors = draftAnswers({
      slides: [slide({ kind: 'foto', filename: REF, textSeite: 'unten' })],
    });

    await expect(draftSharepic('Solar auf jedes Dach', 'de-DE', null, [], null)).rejects.toThrow();
    expect(errors[0]).toContain('gibt es nicht');
  });
});
