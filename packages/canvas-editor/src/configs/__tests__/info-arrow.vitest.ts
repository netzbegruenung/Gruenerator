import { describe, it, expect, beforeAll } from 'vitest';

import { loadCanvasConfig } from '../configLoader';

import type { ImageElementConfig } from '../types';

/**
 * Der Pfeil der Info-Vorlage folgt ueber `fromLayout` der Hoehe der
 * Ueberschrift. Wer ihn von Hand verschiebt, schreibt eine absolute Position —
 * die musste vorher nirgends hin und war nach dem Neuladen weg.
 */
describe('Info-Vorlage: Pfeil', () => {
  beforeAll(async () => {
    await loadCanvasConfig('info');
  }, 120_000);

  it('haelt Position und Groesse in eigenen Zustandsschluesseln', async () => {
    const config = await loadCanvasConfig('info');
    const arrow = config.elements.find((el) => el.id === 'arrow') as
      ImageElementConfig<Record<string, unknown>> | undefined;

    expect(arrow).toBeTruthy();
    expect(arrow?.type).toBe('image');
    expect(arrow?.draggable).toBe(true);
    expect(arrow?.positionStateKey).toBe('arrowPosition');
    expect(arrow?.sizeStateKey).toBe('arrowSize');
  });

  it('traegt Pfeil-Position und -Groesse durch createInitialState', async () => {
    // Ohne Eintrag in `passthroughStateKeys` verwirft die Anfangszustands-
    // Whitelist beide Schluessel still — Karten-Renders und Remote-Sync
    // saeten den Pfeil dann wieder auf die Layout-Position zurueck.
    const config = await loadCanvasConfig('info');
    const state = config.createInitialState({
      header: 'Wie kann Teilhabe aussehen?',
      body: 'Ein starker Partner ist das Kinder- und Jugendparlament.',
      arrowPosition: { x: 90, y: 300 },
      arrowSize: { w: 80, h: 80 },
    }) as Record<string, unknown>;

    expect(state.arrowPosition).toEqual({ x: 90, y: 300 });
    expect(state.arrowSize).toEqual({ w: 80, h: 80 });
  });

  it('laesst den Pfeil ohne manuellen Eingriff am Layout haengen', async () => {
    const config = await loadCanvasConfig('info');
    const state = config.createInitialState({ header: 'Kurz', body: 'Text' }) as Record<
      string,
      unknown
    >;

    expect(state.arrowPosition).toBeUndefined();
    expect(state.arrowSize).toBeUndefined();
  });
});
