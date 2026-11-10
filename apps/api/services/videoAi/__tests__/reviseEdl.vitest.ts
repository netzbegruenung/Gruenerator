import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type StructuredValidation } from '../../ai/structuredParsing.js';
import { planContext, validationContext, type ProjectBasics } from '../projectContext.js';
import { type StoredVideoAiAnalysis, type StoredVideoAiVersion } from '../projectTypes.js';
import { compileTimeline } from '../projectTimeline.js';
import { buildTimeline } from '../timeline.js';

import { RADWEG_DURATION, radwegWords } from './fixtures.js';

const aiObject = vi.fn();
vi.mock('../../ai/generate.js', () => ({ aiObject }));
const { buildRevisePrompt, reviseEdl, REVISED_REASON } = await import('../reviseEdl.js');

interface Call {
  lane: string;
  prompt: string;
  validate: (input: unknown, attempt: number, attempts: number) => StructuredValidation<unknown>;
}

const basics: ProjectBasics = {
  locale: 'de-DE',
  brief: {
    title: 'Radweg',
    topic: 'Radweg Sauerlacher Straße',
    format: '9:16',
    style: 'talking-head-ruhig',
    target: { minSeconds: 30, maxSeconds: 45 },
    person: { name: 'Annika Wolfsteiner', role: 'Stadträtin' },
  },
  inputs: [{ id: 'c1', mediaId: 'm-1', role: 'footage', title: 'Take 1' }],
};
const analysis: StoredVideoAiAnalysis = {
  clips: [
    {
      clipId: 'c1',
      role: 'footage',
      proxyMediaId: 'p',
      proxyShareToken: 'tok-c1',
      duration: RADWEG_DURATION,
      width: 1080,
      height: 1920,
      words: radwegWords(),
      detectors: {
        silences: [],
        sceneCuts: [],
        quality: [],
        loudness: { integratedLufs: null, lra: null },
      },
      cells: [],
    },
  ],
  assets: [],
};
const ctx = planContext(basics, analysis);
const current: StoredVideoAiVersion = {
  version: 1,
  edl: {
    version: 1,
    format: '9:16',
    segments: ['c1.s8', 'c1.s5', 'c1.s6', 'c1.s7', 'c1.s11'].map((unitId) => ({ unitId })),
    captions: { enabled: true, template: 'tanne' },
    overlays: [{ kind: 'bauchbinde', atSegment: 1, durationSeconds: 4 }],
    music: null,
  },
  summary: 'Erster Schnitt',
  omitted: { 'c1.s9': 'Abgebrochener Satz' },
  rationale: null,
  createdAt: '2026-11-10T00:00:00.000Z',
};
const input = {
  current,
  timeline: buildTimeline({
    unitIds: current.edl.segments.map((s) => s.unitId),
    units: ctx.units,
    clipDurations: new Map([['c1', RADWEG_DURATION]]),
  }),
  ctx,
  validation: validationContext(basics, ctx, null),
  feedback: 'Den Satz bei 12 Sekunden raus, und ein Hook-Titel wäre gut.',
  times: [12],
  locale: 'de-DE' as const,
};

beforeEach(() => {
  aiObject.mockReset();
});

describe('reviseEdl', () => {
  it('sends broken ops and reordered sentences back, then applies a clean answer', async () => {
    const turns: StructuredValidation<unknown>[] = [];
    aiObject.mockImplementation(async (call: Call) => {
      turns.push(
        call.validate(
          { ops: [{ kind: 'remove_segment' }], zusammenfassung: 'x', antwort: 'x' },
          1,
          3
        )
      );
      turns.push(
        call.validate(
          {
            ops: [{ kind: 'move_segment', unitId: 'c1.s11', before: 'c1.s5' }],
            zusammenfassung: 'x',
            antwort: 'x',
          },
          2,
          3
        )
      );
      const good = {
        ops: [
          { kind: 'remove_segment', unitId: 'c1.s7' },
          {
            kind: 'add_overlay',
            overlay: {
              kind: 'titel',
              preset: 'hook',
              text: 'Sicherer Schulweg',
              atSegment: 0,
              durationSeconds: 3,
            },
          },
        ],
        zusammenfassung: 'Satz raus, Hook-Titel',
        antwort: 'Ich habe den Satz entfernt und einen Hook-Titel gesetzt.',
      };
      const checked = call.validate(good, 3, 3);
      return checked.ok ? { ok: true, data: checked.value } : { ok: false, error: checked.error };
    });

    const revision = await reviseEdl(input);

    expect(turns[0]).toEqual({ ok: false, error: expect.stringContaining('unitId') });
    expect(turns[1]).toEqual({ ok: false, error: expect.stringContaining('Reihenfolge') });
    expect(revision.edl.segments.map((s) => s.unitId)).toEqual([
      'c1.s8',
      'c1.s5',
      'c1.s6',
      'c1.s11',
    ]);
    expect(revision.omitted).toEqual({ 'c1.s9': 'Abgebrochener Satz', 'c1.s7': REVISED_REASON });
    expect(revision.summary).toBe('Satz raus, Hook-Titel');
    expect((aiObject.mock.calls[0][0] as Call).lane).toBe('video_ai_revise');
  });

  it('shows the plan, the omitted sentences and where the person pointed', () => {
    const prompt = buildRevisePrompt(input);
    expect(prompt).toMatch(/#0 c1\.s8 \[0\.0–/);
    expect(prompt).toContain('c1.s9 „');
    expect(prompt).toContain('– Abgebrochener Satz');
    expect(prompt).toMatch(/12\.0 s → #\d c1\.s\d+/);
    expect(prompt).toContain('[0] {"kind":"bauchbinde"');
  });
});

describe('compileTimeline', () => {
  it('puts caption corrections on the word and streams clips from the proxy', () => {
    const word = ctx.units.get('c1.s5')!.words[0];
    const fixed: StoredVideoAiVersion = {
      ...current,
      edl: {
        ...current.edl,
        captionFixes: [{ unitId: 'c1.s5', start: word.start, text: 'Servus' }],
      },
    };
    const timeline = compileTimeline(
      {
        ...basics,
        id: '00000000-0000-4000-8000-000000000001',
        user_id: 'u',
        slug_suffix: 's',
        title: 'Radweg',
        status: 'ready',
        error: null,
        warnings: [],
        analysis,
        versions: [fixed],
        current_version: 1,
        handed_off_at: null,
        created_at: new Date(),
        inputs: [...basics.inputs],
      },
      analysis,
      fixed,
      new Map()
    );
    expect(timeline.words.filter((w) => w.segmentIndex === 1)[0].text).toBe('Servus');
    expect(timeline.clips[0]).toMatchObject({ shareToken: 'tok-c1', width: 1080, height: 1920 });
    expect(timeline.person).toEqual({ name: 'Annika Wolfsteiner', role: 'Stadträtin' });
  });
});
