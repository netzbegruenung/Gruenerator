import { describe, expect, it } from 'vitest';

import { createDraftLedger } from './draftLedger.js';

function setup() {
  let text = '';
  const starts: number[] = [];
  const ledger = createDraftLedger(
    () => text,
    () => starts
  );
  return {
    ledger,
    write: (t: string) => (text += t),
    toolStart: () => starts.push(text.length),
    get text() {
      return text;
    },
  };
}

describe('createDraftLedger', () => {
  it('takes the text written since the last tool started', () => {
    const s = setup();
    s.write('Ich recherchiere. ');
    s.toolStart();
    s.write('ENTWURF');
    expect(s.ledger.take()).toBe('ENTWURF');
  });

  it('takes the whole answer when no tool ran before', () => {
    const s = setup();
    s.write('ENTWURF');
    expect(s.ledger.take()).toBe('ENTWURF');
  });

  it('cuts a superseded draft and keeps the last one', () => {
    const s = setup();
    s.write('ERSTE FASSUNG');
    s.ledger.take();
    s.toolStart(); // the rechnen call itself, recorded once it finished
    s.write('\n\nZWEITE FASSUNG');
    expect(s.ledger.take()).toBe('\n\nZWEITE FASSUNG');
    expect(s.ledger.withoutSuperseded(s.text)).toBe('ZWEITE FASSUNG');
  });

  it('keeps text written before the first draft', () => {
    const s = setup();
    s.write('Vorrede. ');
    s.toolStart();
    s.write('ERSTE');
    s.ledger.take();
    s.toolStart();
    s.write('ZWEITE');
    s.ledger.take();
    expect(s.ledger.withoutSuperseded(s.text)).toBe('Vorrede. ZWEITE');
  });

  it('cuts nothing after a single count', () => {
    const s = setup();
    s.write('EINZIGE');
    s.ledger.take();
    expect(s.ledger.withoutSuperseded(s.text)).toBeNull();
  });

  it('cuts nothing when the answer was replaced since', () => {
    const s = setup();
    s.write('ERSTE');
    s.ledger.take();
    s.toolStart();
    s.write('ZWEITE');
    s.ledger.take();
    expect(s.ledger.withoutSuperseded('Reparierte Antwort')).toBeNull();
  });
});
