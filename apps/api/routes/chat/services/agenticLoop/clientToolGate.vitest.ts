import { describe, it, expect, vi } from 'vitest';

import { createClientToolGate } from './clientToolGate.js';

const resolved = { clientToolName: 'render_sharepic', clientArgs: { variantId: 'v1' } };

describe('createClientToolGate', () => {
  it('hält den Aufruf, merkt ihn samt Browser-Auftrag vor und bricht über das Signal ab', async () => {
    const gate = createClientToolGate(async () => resolved);
    expect(gate.hasPending()).toBe(false);

    const held = await gate.hold({ toolName: 'check_sharepic', stepId: 'c1', args: {} });

    expect(held).toBeNull();
    expect(gate.signal.aborted).toBe(true);
    expect(gate.pending()).toEqual({
      toolCallId: 'c1',
      toolName: 'check_sharepic',
      args: {},
      clientToolName: 'render_sharepic',
      clientArgs: { variantId: 'v1' },
    });
  });

  it('ein Auflösefehler geht als Ergebnis ans Modell, der Zug läuft weiter', async () => {
    const gate = createClientToolGate(async () => ({ error: 'kein Sharepic' }));

    const held = await gate.hold({ toolName: 'check_sharepic', stepId: 'c1', args: {} });

    expect(held).toEqual({ error: 'kein Sharepic' });
    expect(gate.hasPending()).toBe(false);
    expect(gate.signal.aborted).toBe(false);
  });

  it('die erste Anforderung gewinnt, auch wenn Geschwister gleichzeitig auflösen', async () => {
    const resolve = vi.fn(async () => resolved);
    const gate = createClientToolGate(resolve);

    const [a, b] = await Promise.all([
      gate.hold({ toolName: 'check_sharepic', stepId: 'c1', args: {} }),
      gate.hold({ toolName: 'check_sharepic', stepId: 'c2', args: {} }),
    ]);

    expect(a).toBeNull();
    expect(b).toEqual({ error: expect.any(String) });
    expect(gate.pending()?.toolCallId).toBe('c1');
  });

  // #5044: ein Aufruf, den eine Freigabe-Pause überholt hat, kommt in der
  // Fortsetzung zurück — schon aufgelöst, ohne zweiten Codegen.
  it('setzt einen mitgereisten Aufruf wieder ein, ohne erneut aufzulösen', () => {
    const resolve = vi.fn(async () => resolved);
    const gate = createClientToolGate(resolve);
    const held = {
      toolCallId: 't1',
      toolName: 'tabelle_auswerten',
      args: { auftrag: 'Summe' },
      clientToolName: 'run_python',
      clientArgs: { code: 'print(1)' },
    };

    expect(gate.restore(held)).toBe(true);
    expect(gate.pending()).toEqual(held);
    expect(gate.signal.aborted).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('hält schon ein anderer Aufruf, entfällt der wiedereingesetzte', async () => {
    const gate = createClientToolGate(async () => resolved);
    await gate.hold({ toolName: 'check_sharepic', stepId: 'c1', args: {} });

    expect(
      gate.restore({
        toolCallId: 't1',
        toolName: 'tabelle_auswerten',
        args: {},
        clientToolName: 'run_python',
        clientArgs: {},
      })
    ).toBe(false);
    expect(gate.pending()?.toolCallId).toBe('c1');
  });
});
