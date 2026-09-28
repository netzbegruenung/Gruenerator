/**
 * `reisekosten_abrechnung` against the real engine and PDF builder; only the
 * asset storage is mocked. The guarantees under test: no PDF while the claim
 * is incomplete, and a missing IBAN never blocks the PDF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeReisekostenTool, toReisekostenState } from './reisekostenTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const persistComputeAssets = vi.fn();

vi.mock('../services/computeAssetStorage.js', () => ({
  persistComputeAssets: (...args: unknown[]) => persistComputeAssets(...args),
}));

function makeCtx() {
  const sent: Array<{ event: string; payload: unknown }> = [];
  const state = { agentConfig: { userId: 'user-1' } } as unknown as ChatGraphState;
  const sse = {
    send: (event: string, payload: unknown) => sent.push({ event, payload }),
  } as unknown as SSEWriter;
  return { ctx: { state, sse }, sent, state };
}

const run = (tool: unknown, input: unknown) =>
  (tool as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    { toolCallId: 'c1', messages: [] }
  );

// The official NRW worked example (325,13 € gesamt, 270,58 € Auszahlung),
// with a return date recent enough for the 3-month deadline.
const complete = () => {
  const rueckkehr = new Date(Date.now() - 2 * 86_400_000);
  const beginn = new Date(rueckkehr.getTime() - 86_400_000);
  const local = (d: Date) => `${d.toISOString().slice(0, 10)}T12:00`;
  return {
    stammdaten: {
      name: 'Alex Beispiel',
      strasse: 'Hauptstr.',
      hausnr: '1',
      plz: '40211',
      ort: 'Düsseldorf',
      email: 'alex@example.org',
    },
    reise: {
      anlass: 'Länderrat',
      ziel: 'Westhafenstraße 1, 13353 Berlin',
      reisebeginn: local(beginn),
      rueckkehr: local(rueckkehr),
    },
    bahn: { betrag: 164.69, belegVorhanden: true },
    verpflegungAbzuege: [{ datum: local(rueckkehr).slice(0, 10), fruehstueck: true }],
    uebernachtung: { modus: 'beleg' as const, betrag: 138.04 },
    spende: 54.55,
  };
};

describe('reisekosten_abrechnung', () => {
  beforeEach(() => {
    persistComputeAssets.mockReset();
    persistComputeAssets.mockImplementation((_user: string, payload: unknown) =>
      Promise.resolve(payload)
    );
  });

  it('computes with the engine and lists what is missing', async () => {
    const { ctx } = makeCtx();
    const out = await run(makeReisekostenTool(ctx), { bahn: { betrag: 50 }, pdfErstellen: false });
    expect(out.ok).toBe(true);
    expect((out.aufstellung as { gesamt: number }).gesamt).toBe(50);
    expect(out.fehler).toEqual(expect.arrayContaining(['Name fehlt.', 'Reisebeginn fehlt.']));
    expect(persistComputeAssets).not.toHaveBeenCalled();
  });

  it('refuses the PDF while the claim is incomplete', async () => {
    const { ctx, sent } = makeCtx();
    const out = await run(makeReisekostenTool(ctx), { bahn: { betrag: 50 }, pdfErstellen: true });
    expect(out.error).toMatch(/NICHT erstellt/);
    expect(persistComputeAssets).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('builds the PDF without an IBAN and hands it to the compute card', async () => {
    const { ctx, sent, state } = makeCtx();
    const out = await run(makeReisekostenTool(ctx), { ...complete(), pdfErstellen: true });

    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.aufstellung).toMatchObject({ gesamt: 325.13, auszahlung: 270.58 });
    expect(out.hinweise).toEqual(
      expect.arrayContaining([expect.stringMatching(/IBAN.*handschriftlich/)])
    );
    expect(persistComputeAssets).toHaveBeenCalledTimes(1);
    const payload = persistComputeAssets.mock.calls[0]![1] as {
      files: Array<{ name: string; b64: string }>;
    };
    expect(payload.files[0]!.name).toMatch(/^reisekosten-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(Buffer.from(payload.files[0]!.b64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(sent.map((e) => e.event)).toEqual(['compute']);
    expect(state.computedResultFresh).toBe(true);
  });

  it('never echoes the IBAN back into the tool result', async () => {
    const { ctx } = makeCtx();
    const iban = 'DE89370400440532013000';
    const input = { ...complete(), pdfErstellen: true };
    const out = await run(makeReisekostenTool(ctx), {
      ...input,
      stammdaten: { ...input.stammdaten, iban },
    });
    expect(JSON.stringify(out)).not.toContain(iban);
  });
});

describe('toReisekostenState', () => {
  it('fills the flags the model did not set with the safe default', () => {
    const state = toReisekostenState({ kfz: { km: 600 }, pdfErstellen: false });
    expect(state.fahrt.kfz).toEqual({
      km: 600,
      fahrzeug: 'pkw',
      routenplanerVorhanden: false,
      dbFlexpreis: null,
      vorstandsbeschluss: false,
    });
    expect(state.rateKey).toBe('de-DE/nrw');
  });
});
