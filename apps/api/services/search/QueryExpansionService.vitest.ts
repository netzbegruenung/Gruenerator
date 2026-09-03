import { describe, it, expect, vi, beforeEach } from 'vitest';

const aiText = vi.fn();
vi.mock('../ai/generate.js', () => ({
  aiText: (...args: unknown[]) => aiText(...args),
}));

const { expandQuery } = await import('./QueryExpansionService.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('expandQuery with history context', () => {
  it('resolves a follow-up into a standalone primary query', async () => {
    aiText.mockResolvedValue(
      JSON.stringify({
        standalone: 'Windkraft Ausbau Positionen Bayern',
        alternatives: ['Windenergie Bayern Programm', 'Erneuerbare Bayern Wahlprogramm'],
      })
    );
    const result = await expandQuery('Und was heißt das für Bayern?', {
      historyContext: 'Nutzer*in: Was sagt das Programm zu Windkraft?\n\nAssistent: ...',
    });
    expect(result.primary).toBe('Windkraft Ausbau Positionen Bayern');
    expect(result.alternatives).toHaveLength(2);
    const call = aiText.mock.calls[0][0] as { prompt: string; system: string };
    expect(call.prompt).toContain('Gesprächsverlauf:');
    expect(call.prompt).toContain('Anschlussfrage: "Und was heißt das für Bayern?"');
  });

  it('keeps the original wording when the model returns no standalone', async () => {
    aiText.mockResolvedValue(JSON.stringify({ alternatives: ['a1 lang genug', 'a2 lang genug'] }));
    const result = await expandQuery('Und in Bayern?', { historyContext: 'Verlauf' });
    expect(result.primary).toBe('Und in Bayern?');
  });

  it('degrades to the bare query on failure', async () => {
    aiText.mockRejectedValue(new Error('lane down'));
    const result = await expandQuery('Und in Bayern?', { historyContext: 'Verlauf' });
    expect(result).toEqual({ primary: 'Und in Bayern?', alternatives: [] });
  });

  it('never caches history turns, but still caches plain expansions', async () => {
    aiText.mockResolvedValue(JSON.stringify({ alternatives: ['a1 lang genug', 'a2 lang genug'] }));
    await expandQuery('gleiche frage', { historyContext: 'Verlauf A' });
    await expandQuery('gleiche frage', { historyContext: 'Verlauf B' });
    expect(aiText).toHaveBeenCalledTimes(2);

    await expandQuery('cache mich bitte');
    await expandQuery('cache mich bitte');
    expect(aiText).toHaveBeenCalledTimes(3);
  });

  it('does not serve a cached plain expansion for a history turn', async () => {
    aiText.mockResolvedValue(JSON.stringify({ alternatives: ['a1 lang genug', 'a2 lang genug'] }));
    await expandQuery('doppelte frage');
    await expandQuery('doppelte frage', { historyContext: 'Verlauf' });
    // The second call must hit the model with the condense prompt.
    expect(aiText).toHaveBeenCalledTimes(2);
  });

  it('bounds the call with a per-call timeout instead of falling back to REQUEST_TIMEOUT', async () => {
    aiText.mockResolvedValue(JSON.stringify({ alternatives: ['a1 lang genug', 'a2 lang genug'] }));
    await expandQuery('Und in Bayern?', { historyContext: 'Verlauf' });
    const call = aiText.mock.calls[0][0] as { timeoutMs?: number };
    expect(call.timeoutMs).toBe(4000);
  });

  it('a timed-out call degrades to the raw query, like any other failure', async () => {
    aiText.mockRejectedValue(Object.assign(new Error('Request timeout after 4000ms'), {}));
    const result = await expandQuery('Und in Bayern?', { historyContext: 'Verlauf' });
    expect(result).toEqual({ primary: 'Und in Bayern?', alternatives: [] });
  });

  it('skips the alternatives step when the caller only keeps one variant', async () => {
    aiText.mockResolvedValue(JSON.stringify({ standalone: 'Hitzeschutz Bayern' }));
    const result = await expandQuery('Und in Bayern?', {
      historyContext: 'Verlauf',
      variants: 0,
    });
    expect(result).toEqual({ primary: 'Hitzeschutz Bayern', alternatives: [] });
    const call = aiText.mock.calls[0][0] as { system: string; maxOutputTokens: number };
    expect(call.system).not.toContain('alternative Formulierungen');
    expect(call.maxOutputTokens).toBe(80);
  });
});
