import { describe, expect, it, vi } from 'vitest';

import { TreeBudgetExceededError } from '../trees/index.js';

vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));

import {
  GENERIC_FAILURE,
  MAX_ATTEMPTS,
  PROVIDER_BUSY_FAILURE,
  handleFailure,
  processClaimed,
  toSegments,
  type ClaimedPodcast,
  type PodcastWorkerDeps,
} from './podcastWorker.js';

const script = {
  turns: [
    { speaker: 'a' as const, text: 'Was ist das?' },
    { speaker: 'b' as const, text: 'Das erkläre ich.' },
  ],
};

function claimed(overrides: Partial<ClaimedPodcast> = {}): ClaimedPodcast {
  return {
    id: 'p1',
    user_id: 'u1',
    title: 'Antwort',
    source_text: 'Quelle',
    script: null,
    voice_a: '1930',
    voice_b: '1885',
    locale: 'de-DE',
    attempts: 1,
    ...overrides,
  };
}

function deps(): PodcastWorkerDeps & { sql: string[]; params: unknown[][] } {
  const sql: string[] = [];
  const params: unknown[][] = [];
  return {
    sql,
    params,
    db: {
      query: vi.fn(async (q: string, p: unknown[] = []) => {
        sql.push(q);
        params.push(p);
        return [];
      }) as PodcastWorkerDeps['db']['query'],
    },
    writeScript: vi.fn(async () => ({ title: 'Schwammstadt kurz erklärt', turns: script.turns })),
    synthesize: vi.fn(async () => ({
      pcm: Buffer.alloc(48000),
      sampleRate: 24000,
      durationSeconds: 1,
    })),
    encode: vi.fn(async () => ({
      buffer: Buffer.from('mp3'),
      mimeType: 'audio/mpeg' as const,
      extension: 'mp3' as const,
    })),
    createAudioShare: vi.fn(async () => ({
      id: 'media-1',
      shareToken: 'tok',
      shareUrl: '/share/tok',
      createdAt: new Date(),
    })),
  };
}

describe('toSegments', () => {
  it('gives each speaker their voice', () => {
    expect(toSegments(claimed(), script)).toEqual([
      { text: 'Was ist das?', voiceId: '1930' },
      { text: 'Das erkläre ich.', voiceId: '1885' },
    ]);
  });
});

describe('processClaimed', () => {
  it('writes the script, voices it and stores one Mediathek audio', async () => {
    const d = deps();
    await processClaimed(claimed(), d);

    expect(d.writeScript).toHaveBeenCalledWith('Quelle', 'Antwort', 'de-DE');
    expect(d.synthesize).toHaveBeenCalledWith('u1', toSegments(claimed(), script));
    expect(d.createAudioShare).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Schwammstadt kurz erklärt', durationSeconds: 1 })
    );
    const finish = d.params.at(-1);
    expect(d.sql.at(-1)).toContain("status = 'ready'");
    expect(finish).toEqual(['p1', 'media-1', 1]);
  });

  it('keeps a written script on retry instead of paying the LLM twice', async () => {
    const d = deps();
    await processClaimed(claimed({ script }), d);
    expect(d.writeScript).not.toHaveBeenCalled();
    expect(d.params[0]).toEqual(['p1', 'voicing']);
  });
});

describe('handleFailure', () => {
  it('fails at once with the budget sentence', async () => {
    const d = deps();
    const error = new TreeBudgetExceededError(
      {
        usedUnits: 1000,
        limitUnits: 1000,
        remainingUnits: 0,
        resetsAt: new Date(),
        newsletterBonus: false,
        day: '2026-10-10',
      },
      100
    );
    await handleFailure(claimed(), error, d);
    expect(d.sql[0]).toContain("status = 'failed'");
    expect(d.params[0]).toEqual(['p1', error.message]);
  });

  it('frees the claim for another try while attempts remain', async () => {
    const d = deps();
    await handleFailure(claimed({ attempts: 1 }), new Error('boom'), d);
    expect(d.sql[0]).toContain('claim_at = NULL');
    expect(d.sql[0]).not.toContain('failed');
  });

  it('fails with a readable sentence once attempts are used up', async () => {
    const d = deps();
    await handleFailure(claimed({ attempts: MAX_ATTEMPTS }), new Error('boom'), d);
    expect(d.params[0]).toEqual(['p1', GENERIC_FAILURE]);

    const busy = deps();
    await handleFailure(
      claimed({ attempts: MAX_ATTEMPTS }),
      new Error('KugelAudio antwortete mit 429: Concurrent generation limit reached (3)'),
      busy
    );
    expect(busy.params[0]).toEqual(['p1', PROVIDER_BUSY_FAILURE]);
  });
});
