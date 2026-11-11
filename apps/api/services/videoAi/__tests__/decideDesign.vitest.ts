import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type StructuredValidation } from '../../ai/structuredParsing.js';
import { validateEdl } from '../validateEdl.js';

import { RADWEG_DURATION, radwegUnits } from './fixtures.js';

interface Call {
  lane: string;
  system: string;
  prompt: string;
  validate: (input: unknown, attempt: number, attempts: number) => StructuredValidation<unknown>;
}

const aiObject = vi.fn();
vi.mock('../../ai/generate.js', () => ({ aiObject }));

const { buildDesignPrompt, checkDesign, decideDesign, lowerThirdSegment, segmentsFor } =
  await import('../decideDesign.js');

const units = radwegUnits();
const unitIds = ['c1.s8', 'c1.s5', 'c1.s6', 'c1.s7', 'c1.s11', 'c1.s16', 'c1.s17', 'c1.s18'];
const clips = [
  { id: 'c1', role: 'footage' as const, duration: RADWEG_DURATION, summary: '' },
  { id: 'c2', role: 'broll' as const, duration: 8, summary: 'Kinder fahren Rad' },
];
const assets = [
  {
    id: 'a1',
    kind: 'image' as const,
    label: 'strasse.jpg',
    description: 'Enge Straße',
    durationSeconds: null,
  },
  { id: 'm1', kind: 'audio' as const, label: 'beat.mp3', description: null, durationSeconds: 90 },
];
const brief = {
  topic: 'Radweg Sauerlacher Straße',
  format: '9:16' as const,
  target: { minSeconds: 30, maxSeconds: 45 },
  hints: null,
  locale: 'de-DE' as const,
  style: 'talking-head-dynamisch' as const,
  person: { name: 'Annika Wolfsteiner', role: 'Stadträtin' },
};

function cutValidation() {
  const v = validateEdl(
    {
      version: 1,
      format: '9:16',
      segments: unitIds.map((unitId) => ({ unitId })),
      captions: { enabled: true },
      overlays: [],
    },
    { units, clips, assets, target: brief.target, briefTexts: [brief.topic] }
  );
  if (!v.ok) throw new Error(v.errors.join());
  return v;
}

const input = {
  brief,
  cut: { unitIds, omitted: {}, rationale: '', validation: cutValidation() },
  units,
  clips,
  assets,
  framing: new Map(unitIds.map((id) => [id, 'mitte' as const])),
  burnedInCaptions: false,
};

/** What Gemma answered in the live run of 2026-11-10 (dynamic style). */
const ANSWER = {
  untertitel: 'balken-tanne',
  titel: [
    { art: 'hook', text: 'Sicherer Schulweg für 400 Kinder', stueck: 0, sekunden: 3 },
    { art: 'statement', text: 'Radweg jetzt planen und bauen', stueck: 4, sekunden: 3 },
  ],
  bilder: [{ id: 'a1', darstellung: 'vollbild', stueck: 3, sekunden: 2.8 }],
  broll: [{ clip: 'c2', ab_sekunde: 0, stueck: 2, sekunden: null }],
  logo: 'ecke',
  musik: { id: 'm1', lautstaerke: 'leise' },
};

beforeEach(() => {
  aiObject.mockReset();
});

describe('segmentsFor', () => {
  it('punches in on every second jump cut in the dynamic style only', () => {
    const framing = new Map(unitIds.map((id) => [id, 'links' as const]));
    const dynamic = segmentsFor(unitIds, units, framing, 'talking-head-dynamisch');
    expect(dynamic.map((s) => s.zoom)).toEqual([
      'normal',
      'nah',
      'normal',
      'nah',
      'normal',
      'nah',
      'normal',
      'nah',
    ]);
    expect(dynamic[0].framing).toBe('links');
    const calm = segmentsFor(unitIds, units, framing, 'talking-head-ruhig');
    expect(calm.every((s) => s.zoom === 'normal')).toBe(true);
  });
});

describe('lowerThirdSegment', () => {
  it('lands where the surname is said, else right after the hook', () => {
    expect(lowerThirdSegment(unitIds, units, 'Annika Wolfsteiner')).toBe(1);
    expect(lowerThirdSegment(unitIds, units, 'Jemand Anderes')).toBe(1);
    expect(lowerThirdSegment(['c1.s5', 'c1.s8'], units, 'Annika Wolfsteiner')).toBe(0);
  });
});

describe('decideDesign', () => {
  it('builds the plan from the answer, fills defaults and adds the lower third', async () => {
    aiObject.mockImplementation(async (call: Call) => {
      const checked = call.validate(ANSWER, 1, 2);
      return checked.ok ? { ok: true, data: checked.value } : { ok: false, error: checked.error };
    });

    const { edl } = await decideDesign(input);

    expect(edl.captions).toEqual({ enabled: true, template: 'balken-tanne' });
    expect(edl.music).toEqual({ assetId: 'm1', volume: 'leise' });
    expect(edl.overlays).toContainEqual({
      kind: 'broll',
      clipId: 'c2',
      sourceStart: 0,
      atSegment: 2,
      durationSeconds: 2.5,
    });
    expect(edl.overlays).toContainEqual({ kind: 'bauchbinde', atSegment: 1, durationSeconds: 4 });
    expect(edl.overlays).toContainEqual({ kind: 'logo', placement: 'ecke' });
    const call = aiObject.mock.calls[0][0] as Call;
    expect(call.lane).toBe('video_ai_design');
    expect(call.system).toContain('Stil: Talking Head dynamisch');
  });

  it('sends invented numbers and a covered hook back as the repair turn', async () => {
    let first: StructuredValidation<unknown> | null = null;
    aiObject.mockImplementation(async (call: Call) => {
      first = call.validate(
        {
          ...ANSWER,
          titel: [{ art: 'hook', text: '500 Kinder in Gefahr', stueck: 0, sekunden: 3 }],
          broll: [{ clip: 'c2', ab_sekunde: 0, stueck: 0, sekunden: 2 }],
        },
        1,
        2
      );
      return { ok: false, error: 'gave up' };
    });

    await expect(decideDesign(input)).rejects.toThrow('gave up');
    expect(first).toEqual({ ok: false, error: expect.stringContaining('Hook') });
    expect(first).toEqual({ ok: false, error: expect.stringContaining('Die Zahl 500') });
  });
});

describe('checkDesign', () => {
  it('refuses our captions on top of burned-in ones and more than two titles', () => {
    const edl = {
      version: 1 as const,
      format: '9:16' as const,
      segments: unitIds.map((unitId) => ({ unitId })),
      captions: { enabled: true },
      overlays: [0, 1, 2].map((i) => ({
        kind: 'titel' as const,
        preset: 'statement' as const,
        text: 'Radweg',
        atSegment: i,
        durationSeconds: 2,
      })),
    };
    expect(checkDesign(edl, { ...input, burnedInCaptions: true })).toEqual([
      'Höchstens 2 Titel, nicht 3.',
      expect.stringContaining('eingebrannte'),
    ]);
  });
});

describe('buildDesignPrompt', () => {
  it('shows the timeline by segment number and the material by id', () => {
    const prompt = buildDesignPrompt(input);
    expect(prompt).toMatch(/#0 \[0\.0–[\d.]+ s\] „Jeden Morgen/);
    expect(prompt).toContain('a1: Bild „strasse.jpg“ – Enge Straße');
    expect(prompt).toContain('c2: B-Roll, 8.0 s – Kinder fahren Rad');
    expect(prompt).toContain('m1: Musik „beat.mp3“, 90 s');
    expect(prompt).toContain('Person: Annika Wolfsteiner, Stadträtin');
  });
});
