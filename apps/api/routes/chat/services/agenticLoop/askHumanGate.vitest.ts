import { describe, it, expect } from 'vitest';

import { createAskHumanGate } from './askHumanGate.js';

describe('createAskHumanGate', () => {
  it('hält die erste Frage, merkt sie vor und bricht über das Signal ab', () => {
    const gate = createAskHumanGate();
    expect(gate.hasPending()).toBe(false);
    expect(gate.signal.aborted).toBe(false);

    gate.hold({
      stepId: 'call_1',
      args: { question: 'Welche Person meinst du?', options: ['Anna Müller', 'Anna Meier'] },
    });

    expect(gate.hasPending()).toBe(true);
    expect(gate.signal.aborted).toBe(true);
    expect(gate.pending()).toEqual({
      toolCallId: 'call_1',
      question: 'Welche Person meinst du?',
      options: ['Anna Müller', 'Anna Meier'],
    });
  });

  it('die erste Frage gewinnt — ein zweiter hold ändert nichts', () => {
    const gate = createAskHumanGate();
    gate.hold({ stepId: 'call_1', args: { question: 'Erste Frage?' } });
    gate.hold({ stepId: 'call_2', args: { question: 'Zweite Frage?' } });

    expect(gate.pending()).toMatchObject({ toolCallId: 'call_1', question: 'Erste Frage?' });
  });

  it('lässt kaputte Optionen weg (weniger als 2 brauchbare ⇒ nur Freitext)', () => {
    const gate = createAskHumanGate();
    gate.hold({ stepId: 'c', args: { question: 'F?', options: ['einzig', 42, ''] } });

    expect(gate.pending()).toEqual({ toolCallId: 'c', question: 'F?' });
  });

  it('fällt auf eine generische Frage zurück, wenn das Modell keine mitgibt', () => {
    const gate = createAskHumanGate();
    gate.hold({ stepId: 'c', args: {} });

    expect(gate.pending()?.question).toBe('Kannst du deine Anfrage präzisieren?');
  });
});
