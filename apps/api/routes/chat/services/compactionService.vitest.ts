import { describe, it, expect, vi } from 'vitest';

import {
  getKeepRecent,
  getCompactionThreshold,
  getCompactionTokenThreshold,
  needsCompaction,
  prepareMessagesWithCompaction,
  KEEP_RECENT,
  COMPACTION_THRESHOLD,
  COMPACTION_TOKEN_THRESHOLD,
} from './compactionService.js';

describe('getKeepRecent', () => {
  it('returns 6 for small context windows (<16K)', () => {
    expect(getKeepRecent(8000)).toBe(6);
    expect(getKeepRecent(15999)).toBe(6);
  });

  it('returns 10 for medium context windows (<32K)', () => {
    expect(getKeepRecent(16000)).toBe(10);
    expect(getKeepRecent(31999)).toBe(10);
  });

  it('returns 15 for large context windows (<64K)', () => {
    expect(getKeepRecent(32000)).toBe(15);
    expect(getKeepRecent(63999)).toBe(15);
  });

  it('returns default (20) for very large context windows', () => {
    expect(getKeepRecent(64000)).toBe(KEEP_RECENT);
    expect(getKeepRecent(128000)).toBe(KEEP_RECENT);
  });

  it('returns default when contextWindowTokens is undefined', () => {
    expect(getKeepRecent(undefined)).toBe(KEEP_RECENT);
    expect(getKeepRecent()).toBe(KEEP_RECENT);
  });
});

describe('getCompactionThreshold', () => {
  it('returns 15 for small context windows', () => {
    expect(getCompactionThreshold(8000)).toBe(15);
  });

  it('returns 25 for medium context windows', () => {
    expect(getCompactionThreshold(16000)).toBe(25);
  });

  it('returns default (50) for large context windows', () => {
    expect(getCompactionThreshold(128000)).toBe(COMPACTION_THRESHOLD);
  });

  it('returns default when undefined', () => {
    expect(getCompactionThreshold()).toBe(COMPACTION_THRESHOLD);
  });
});

describe('getCompactionTokenThreshold', () => {
  it('uses 40% of context window', () => {
    expect(getCompactionTokenThreshold(16000)).toBe(6400);
    expect(getCompactionTokenThreshold(32000)).toBe(12800);
  });

  it('caps at default for large windows', () => {
    expect(getCompactionTokenThreshold(128000)).toBe(COMPACTION_TOKEN_THRESHOLD);
  });

  it('returns default when undefined', () => {
    expect(getCompactionTokenThreshold()).toBe(COMPACTION_TOKEN_THRESHOLD);
  });
});

describe('needsCompaction with contextWindowTokens', () => {
  it('uses model-aware threshold for small context', () => {
    // 16K model (16384 tokens): threshold = 15 messages
    expect(needsCompaction(15, null, undefined, 15000)).toBe(true);
    expect(needsCompaction(14, null, undefined, 15000)).toBe(false);
    // Exactly 16000 falls into <32K bracket: threshold = 25
    expect(needsCompaction(25, null, undefined, 16000)).toBe(true);
    expect(needsCompaction(24, null, undefined, 16000)).toBe(false);
  });

  it('uses model-aware token threshold for small context', () => {
    // 16384 token model: token threshold = floor(16384 * 0.4) = 6553
    expect(needsCompaction(5, null, 6553, 16384)).toBe(true);
    expect(needsCompaction(5, null, 6552, 16384)).toBe(false);
  });

  it('uses default thresholds when contextWindowTokens not provided', () => {
    expect(needsCompaction(50, null)).toBe(true);
    expect(needsCompaction(49, null)).toBe(false);
  });

  it('backward compatible: 128K model uses existing thresholds', () => {
    expect(needsCompaction(50, null, undefined, 128000)).toBe(true);
    expect(needsCompaction(49, null, undefined, 128000)).toBe(false);
  });
});

describe('formatMessagesForSummary', () => {
  it('excludes tool rows and labels roles correctly', async () => {
    const { formatMessagesForSummary } = await import('./compactionService.js');
    const out = formatMessagesForSummary([
      { id: '1', role: 'user', content: 'Erstell mir ein Formular', created_at: new Date(0) },
      {
        id: '2',
        role: 'tool',
        content: '{"toolName":"tally","result":{"ok":true}}',
        created_at: new Date(0),
      },
      {
        id: '3',
        role: 'assistant',
        content: 'Das Formular ist erstellt.',
        created_at: new Date(0),
      },
      { id: '4', role: 'system', content: 'system prompt', created_at: new Date(0) },
    ]);
    expect(out).toContain('Benutzer: Erstell mir ein Formular');
    expect(out).toContain('Assistent: Das Formular ist erstellt.');
    expect(out).not.toContain('toolName');
    expect(out).not.toContain('system prompt');
  });
});

describe('env-overridable thresholds (long-thread eval harness)', () => {
  it('explicit CHAT_COMPACTION_* overrides win over defaults and model tiers', async () => {
    vi.resetModules();
    process.env.CHAT_COMPACTION_THRESHOLD = '8';
    process.env.CHAT_COMPACTION_KEEP_RECENT = '4';
    process.env.CHAT_COMPACTION_COOLDOWN_MS = '0';
    try {
      const mod = await import('./compactionConfig.js');
      expect(mod.COMPACTION_THRESHOLD).toBe(8);
      expect(mod.KEEP_RECENT).toBe(4);
      // Override beats the model-aware tier (small window would return 15/6).
      expect(mod.getCompactionThreshold(12000)).toBe(8);
      expect(mod.getKeepRecent(12000)).toBe(4);
      expect(mod.needsCompaction(8, null)).toBe(true);
      expect(mod.needsCompaction(7, null)).toBe(false);
    } finally {
      delete process.env.CHAT_COMPACTION_THRESHOLD;
      delete process.env.CHAT_COMPACTION_KEEP_RECENT;
      delete process.env.CHAT_COMPACTION_COOLDOWN_MS;
      vi.resetModules();
    }
  });

  it('ignores invalid override values', async () => {
    vi.resetModules();
    process.env.CHAT_COMPACTION_THRESHOLD = 'not-a-number';
    try {
      const mod = await import('./compactionConfig.js');
      expect(mod.COMPACTION_THRESHOLD).toBe(50);
      expect(mod.getCompactionThreshold(12000)).toBe(15);
    } finally {
      delete process.env.CHAT_COMPACTION_THRESHOLD;
      vi.resetModules();
    }
  });
});

// ─── Der fertige Prompt ────────────────────────────────────────────────────
// Die Auswahlregel steht in compactionCarry.vitest.ts. Hier zählt nur, dass
// das Ergebnis den Systemprompt WIRKLICH erreicht — eine Rettung, die nur in
// ihrer eigenen Funktion stattfindet, ist keine.

describe('prepareMessagesWithCompaction — was im Systemprompt ankommt', () => {
  const state = {
    summary: 'Der Assistent hat eine Pressemitteilung zu Solarenergie verfasst.',
    compactedUpToMessageId: 'm1',
    compactionUpdatedAt: new Date(0),
  };
  const pm = 'PRESSEMITTEILUNG '.repeat(200);

  /** keepRecent ist 20 auf grossen Fenstern — 24 Nachrichten schneiden also 4 ab. */
  const thread = (dropped: Array<{ role: string; content: string }>) => [
    ...dropped,
    ...Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `kurze Nachricht ${i}`,
    })),
  ];

  it('trägt den weggeschnittenen Langtext wörtlich in den Systemprompt', () => {
    const result = prepareMessagesWithCompaction(
      thread([
        { role: 'user', content: 'Schreib eine PM' },
        { role: 'assistant', content: pm },
        { role: 'user', content: 'Danke' },
        { role: 'assistant', content: 'Gern.' },
      ]),
      state,
      'BASIS-PROMPT',
      128_000
    );

    expect(result.messages).toHaveLength(20);
    expect(result.systemMessage).toContain('BASIS-PROMPT');
    expect(result.systemMessage).toContain('GESPRÄCHSZUSAMMENFASSUNG');
    expect(result.systemMessage).toContain('PRESSEMITTEILUNG');
    // Der Block gehört VOR die Zeile, die das Nachrichtenfenster ankündigt.
    expect(result.systemMessage.indexOf('WÖRTLICH')).toBeLessThan(
      result.systemMessage.indexOf('Die folgenden Nachrichten')
    );
  });

  it('lässt den Systemprompt unverändert, wenn es nichts zu retten gibt', () => {
    const withCarry = prepareMessagesWithCompaction(
      thread([{ role: 'assistant', content: 'kurz' }]),
      state,
      'BASIS-PROMPT',
      128_000
    );
    expect(withCarry.systemMessage).not.toContain('WÖRTLICH');
    expect(withCarry.systemMessage).toContain(`${state.summary}\n\n---`);
  });

  it('rührt ohne Zusammenfassung nichts an', () => {
    const messages = thread([{ role: 'assistant', content: pm }]);
    const result = prepareMessagesWithCompaction(
      messages,
      { ...state, summary: null },
      'BASIS-PROMPT',
      128_000
    );
    expect(result.systemMessage).toBe('BASIS-PROMPT');
    expect(result.messages).toBe(messages);
  });
});
