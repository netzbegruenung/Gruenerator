import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateText = vi.fn();
const query = vi.fn();

vi.mock('ai', () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...a: unknown[]) => query(...a) }),
}));
vi.mock('../../../services/chat/threadRecallEmbeddingService.js', () => ({
  upsertThreadRecallPoint: () => Promise.resolve(),
}));
vi.mock('../agents/providers.js', () => ({ getIntermediateModel: () => 'heavy-model' }));

import {
  buildSummaryPrompt,
  formatMessagesForSummary,
  generateCompactionSummary,
  getCarryCharBudget,
  getCompactionTokenThreshold,
  getTailTokenBudget,
  needsCompaction,
  prepareMessagesWithCompaction,
  selectSummarySlice,
  type Message,
} from './compactionService.js';

const row = (id: string, role: Message['role'], content: string): Message => ({
  id,
  role,
  content,
  created_at: new Date(0),
});

/** 16 turns plus the current question — the odd count #4790 was cut from. */
const thread = (): Message[] => [
  ...Array.from({ length: 32 }, (_, i) =>
    row(
      `m${i}`,
      i % 2 === 0 ? 'user' : 'assistant',
      `${i % 2 === 0 ? 'Frage' : 'Antwort'} ${i} ${'x'.repeat(400)}`
    )
  ),
  row('m32', 'user', 'Wie viele Unterschriften wurden gesammelt?'),
];

describe('thresholds follow the window', () => {
  it('derive from the pruning budget, not a fixed 24k', () => {
    // 128k: budget 0,7 × 128.000 − 3.000 = 86.600
    expect(getCompactionTokenThreshold(128_000)).toBe(60_619);
    expect(getTailTokenBudget(128_000)).toBe(25_980);
    expect(getCarryCharBudget(128_000)).toBe(17_320 * 4);
    // 262k: 180.500
    expect(getCompactionTokenThreshold(262_144)).toBe(126_349);
  });

  it('fires on the verbatim tail only', () => {
    expect(needsCompaction(60_619, 128_000)).toBe(true);
    expect(needsCompaction(60_618, 128_000)).toBe(false);
  });

  it('reads the dev overrides per call', () => {
    process.env.CHAT_COMPACTION_TOKEN_THRESHOLD = '3000';
    process.env.CHAT_COMPACTION_TAIL_TOKENS = 'nope';
    try {
      expect(getCompactionTokenThreshold(128_000)).toBe(3000);
      expect(getTailTokenBudget(128_000)).toBe(25_980);
    } finally {
      delete process.env.CHAT_COMPACTION_TOKEN_THRESHOLD;
      delete process.env.CHAT_COMPACTION_TAIL_TOKENS;
    }
  });
});

describe('formatMessagesForSummary', () => {
  it('excludes tool rows and labels roles correctly', () => {
    const out = formatMessagesForSummary([
      row('1', 'user', 'Erstell mir ein Formular'),
      row('2', 'tool', '{"toolName":"tally","result":{"ok":true}}'),
      row('3', 'assistant', 'Das Formular ist erstellt.'),
      row('4', 'system', 'system prompt'),
    ]);
    expect(out).toContain('Benutzer: Erstell mir ein Formular');
    expect(out).toContain('Assistent: Das Formular ist erstellt.');
    expect(out).not.toContain('toolName');
    expect(out).not.toContain('system prompt');
  });
});

describe('selectSummarySlice (#4790)', () => {
  it('ends on an assistant row, never on the open question', () => {
    for (const tail of [0, 300, 1_000, 2_000]) {
      const slice = selectSummarySlice(thread(), null, tail);
      expect(slice.length).toBeGreaterThan(0);
      expect(slice.at(-1)!.role).toBe('assistant');
    }
  });

  it('keeps the budget verbatim, widened back to the turn start', () => {
    const messages = thread();
    const slice = selectSummarySlice(messages, null, 1_000);
    const kept = messages.slice(slice.length);
    const keptTokens = kept
      .slice(1)
      .reduce((n, m) => n + Math.ceil((m.content ?? '').length / 4), 0);
    expect(keptTokens).toBeLessThanOrEqual(1_000);
    expect(kept[0].role).toBe('user');
    expect(kept.at(-1)!.id).toBe('m32');
  });

  it('starts after the previous summary', () => {
    const slice = selectSummarySlice(thread(), 'm9', 0);
    expect(slice[0].id).toBe('m10');
  });

  it('returns nothing when the whole rest fits the tail', () => {
    expect(selectSummarySlice(thread(), null, 1_000_000)).toEqual([]);
  });
});

describe('buildSummaryPrompt (#4790)', () => {
  it('fences the transcript and puts the task after it', () => {
    const prompt = buildSummaryPrompt('Benutzer: Wie viele Unterschriften?', null);
    expect(prompt.indexOf('<verlauf>')).toBeLessThan(prompt.indexOf('Benutzer:'));
    expect(prompt.indexOf('</verlauf>')).toBeLessThan(prompt.indexOf('Beantworte keine Frage'));
    expect(prompt).not.toContain('bisherige_zusammenfassung');
  });

  it('merges a previous summary', () => {
    const prompt = buildSummaryPrompt('Benutzer: weiter', 'ALTE ZUSAMMENFASSUNG');
    expect(prompt).toContain('<bisherige_zusammenfassung>\nALTE ZUSAMMENFASSUNG');
    expect(prompt).toMatch(/Führe die bisherige Zusammenfassung/);
  });
});

describe('generateCompactionSummary', () => {
  beforeEach(() => {
    generateText.mockReset().mockResolvedValue({ text: '  NEUE ZUSAMMENFASSUNG ' });
    query.mockReset().mockResolvedValue([]);
    process.env.CHAT_COMPACTION_TAIL_TOKENS = '1000';
  });
  afterEach(() => {
    delete process.env.CHAT_COMPACTION_TAIL_TOKENS;
  });

  it('summarises a slice that ends on the assistant and stores its end', async () => {
    const summary = await generateCompactionSummary('t1', thread(), 128_000);
    expect(summary).toBe('NEUE ZUSAMMENFASSUNG');
    const { prompt } = generateText.mock.calls[0][0] as { prompt: string };
    const transcript = prompt.slice(prompt.indexOf('<verlauf>'), prompt.indexOf('</verlauf>'));
    expect(transcript.trim().split('\n\n').at(-1)).toMatch(/^Assistent:/);
    expect(transcript).not.toContain('Unterschriften');
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('NEUE ZUSAMMENFASSUNG');
    expect(String(params[1])).toMatch(/^m\d+$/);
  });

  it('builds on the previous summary when its end row still exists', async () => {
    await generateCompactionSummary('t1', thread(), 128_000, {
      summary: 'ALT',
      compactedUpToMessageId: 'm9',
      compactionUpdatedAt: null,
    });
    const { prompt } = generateText.mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain('ALT');
    expect(prompt).not.toContain('Frage 8 ');
    expect(prompt).toContain('Frage 10 ');
  });

  it('starts over when the previous end row is gone', async () => {
    await generateCompactionSummary('t1', thread(), 128_000, {
      summary: 'ALT',
      compactedUpToMessageId: 'deleted',
      compactionUpdatedAt: null,
    });
    const { prompt } = generateText.mock.calls[0][0] as { prompt: string };
    expect(prompt).not.toContain('bisherige_zusammenfassung');
    expect(prompt).toContain('Frage 0 ');
  });

  it('returns null without calling the model when nothing is to summarise', async () => {
    expect(await generateCompactionSummary('t1', thread().slice(-2), 128_000)).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('folds a delta larger than one call in chunks', async () => {
    const big = [
      ...Array.from({ length: 6 }, (_, i) =>
        row(`b${i}`, i % 2 === 0 ? 'user' : 'assistant', 'y'.repeat(200_000))
      ),
      row('q', 'user', 'kurz'),
    ];
    await generateCompactionSummary('t1', big, 128_000);
    expect(generateText.mock.calls.length).toBeGreaterThan(1);
    const second = generateText.mock.calls[1][0] as { prompt: string };
    expect(second.prompt).toContain('NEUE ZUSAMMENFASSUNG');
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

  /** 20 Zeilen nach der Grenze — 24 Nachrichten schneiden also 4 ab. */
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
      20,
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
      20,
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
      20,
      128_000
    );
    expect(result.systemMessage).toBe('BASIS-PROMPT');
    expect(result.messages).toBe(messages);
  });
});

describe('prepareMessagesWithCompaction — Grenze und Material', () => {
  const state = {
    summary: 'ZUSAMMENFASSUNG',
    compactedUpToMessageId: 'm1',
    compactionUpdatedAt: null,
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `n${i}`,
  }));

  it('keeps every row written after the summary, not a fixed 20', () => {
    const result = prepareMessagesWithCompaction(messages, state, 'BASIS', 27, 128_000);
    expect(result.messages).toHaveLength(27);
    expect(result.messages[0].content).toBe('n3');
  });

  it('ignores a summary whose end row is gone', () => {
    const result = prepareMessagesWithCompaction(messages, state, 'BASIS', null, 128_000);
    expect(result.messages).toBe(messages);
    expect(result.systemMessage).toBe('BASIS');
  });

  it('keeps the newest message even when nothing came after the end row', () => {
    expect(
      prepareMessagesWithCompaction(messages, state, 'BASIS', 0, 128_000).messages
    ).toHaveLength(1);
  });

  it('carries a summarised paste verbatim (#4790, #4791)', () => {
    const paste = 'Mindestens 2,50 Meter breit, Telefon 09642 123456. '.repeat(40);
    const result = prepareMessagesWithCompaction(
      [{ role: 'user', content: paste }, { role: 'assistant', content: 'Danke' }, ...messages],
      state,
      'BASIS',
      10,
      128_000
    );
    expect(result.systemMessage).toContain('EINGEFÜGTES MATERIAL');
    expect(result.systemMessage).toContain('Telefon 09642 123456');
  });
});
