import { describe, it, expect } from 'vitest';

import { runAssertions } from './assertions.js';
import { type ChatTrace } from './types.js';

function trace(over: Partial<ChatTrace> = {}): ChatTrace {
  return {
    intent: 'agentic',
    agentic: true,
    toolCalls: [],
    sharepicGenerated: false,
    imageGenerated: false,
    citations: [],
    sources: 0,
    fullText: '',
    latencyMs: 1000,
    error: null,
    ...over,
  };
}

const names = (rs: { name: string; pass: boolean }[]) =>
  Object.fromEntries(rs.map((r) => [r.name, r.pass]));

describe('runAssertions — each failure class we hit live', () => {
  it('a dead stream fails once, not per-assertion', () => {
    const rs = runAssertions(trace({ error: 'timeout' }), { grounded: true, cited: true });
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ name: 'streamCompleted', pass: false });
  });

  it('internalOnly fails when web is used despite internal hits (the over-search bug)', () => {
    const rs = runAssertions(
      trace({
        toolCalls: [
          { toolName: 'gruenerator_search', ok: true, args: {}, summary: '5 Ergebnisse' },
          { toolName: 'web_search', ok: true, args: {} },
        ],
      }),
      { internalOnly: true }
    );
    expect(names(rs)['internalOnly']).toBe(false);
  });

  it('internalOnly passes when internal came up empty and web was the fallback', () => {
    const rs = runAssertions(
      trace({
        toolCalls: [
          { toolName: 'gruenerator_search', ok: true, args: {}, summary: '0 Ergebnisse' },
          { toolName: 'web_search', ok: true, args: {} },
        ],
      }),
      { internalOnly: true }
    );
    expect(names(rs)['internalOnly']).toBe(true);
  });

  it('noInventedUrls fails on a 404 scrape (the guessed gruene.de URL)', () => {
    const rs = runAssertions(
      trace({
        toolCalls: [{ toolName: 'scrape_url', ok: false, args: {}, result: { error: '404' } }],
      }),
      { noInventedUrls: true }
    );
    expect(names(rs)['noInventedUrls']).toBe(false);
  });

  it('cited catches bare (unbracketed) citation numbers', () => {
    // "20" appears bracketed AND bare — the exact unclean-citation case.
    const rs = runAssertions(
      trace({ fullText: 'Begünstigung im gebotenen Umfang 20. Steuersatz 1 % [20].', sources: 20 }),
      { cited: true }
    );
    expect(names(rs)['cited']).toBe(false);
  });

  it('cited passes on clean bracketed markers and ignores real numbers', () => {
    const rs = runAssertions(
      trace({ fullText: 'Ab 2 Millionen Euro, Steuersatz 1 % [3][7].', sources: 8 }),
      { cited: true }
    );
    expect(names(rs)['cited']).toBe(true);
  });

  it('cited fails when a citation number exceeds the source count', () => {
    const rs = runAssertions(trace({ fullText: 'Aussage [27].', sources: 5 }), { cited: true });
    expect(names(rs)['cited']).toBe(false);
  });

  it('noCapabilityRefusal catches the "I am just a text model" refusal', () => {
    const rs = runAssertions(
      trace({ fullText: 'Da ich ein textbasiertes KI-Modell bin, kann ich kein Bild erstellen.' }),
      { noCapabilityRefusal: true }
    );
    expect(names(rs)['noCapabilityRefusal']).toBe(false);
  });

  it('generatesSharepic fails when no sharepic was produced', () => {
    const rs = runAssertions(trace({ sharepicGenerated: false }), { generatesSharepic: true });
    expect(names(rs)['generatesSharepic']).toBe(false);
    expect(
      names(runAssertions(trace({ sharepicGenerated: true }), { generatesSharepic: true }))[
        'generatesSharepic'
      ]
    ).toBe(true);
  });

  it('demoted fails when the intent event lacked agentic:true', () => {
    expect(names(runAssertions(trace({ agentic: false }), { demoted: true }))['demoted']).toBe(
      false
    );
  });

  it('topicsCovered fails when a topic is missing (multi-topic starvation)', () => {
    const rs = runAssertions(trace({ fullText: 'Zur Atomkraft: ... (nichts zu den anderen)' }), {
      topicsCovered: ['Atomkraft', 'Tempolimit', 'Vermögensteuer'],
    });
    expect(names(rs)['topic:Atomkraft']).toBe(true);
    expect(names(rs)['topic:Tempolimit']).toBe(false);
    expect(names(rs)['topic:Vermögensteuer']).toBe(false);
  });

  it('correctsFalsePremise passes when the answer negates the premise', () => {
    expect(
      names(
        runAssertions(trace({ fullText: 'Nein, das stimmt nicht — im Gegenteil.' }), {
          correctsFalsePremise: true,
        })
      )['correctsFalsePremise']
    ).toBe(true);
  });

  it('routing + latency assertions', () => {
    const rs = runAssertions(trace({ intent: 'sharepic', latencyMs: 50000 }), {
      routing: 'sharepic',
      maxLatencyMs: 45000,
    });
    expect(names(rs)['routing']).toBe(true);
    expect(names(rs)['latency']).toBe(false);
  });
});
