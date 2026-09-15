import { describe, it, expect } from 'vitest';

import { imageVisibility } from './imageVisibility.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Die Prüfung, die #3313 offen hatte: Prompt und Transport müssen dieselbe
 * Antwort geben. Wer hier einen Zweig ändert, ändert damit BEIDE Seiten — und
 * genau das ist der Zweck dieser Datei.
 */
const state = (over: Partial<ChatGraphState>): Parameters<typeof imageVisibility>[0] =>
  ({
    intent: 'direct',
    enabledTools: {},
    imageAttachments: [{ name: 'plakat.png', type: 'image/png', data: 'AAAA' }],
    ...over,
  }) as Parameters<typeof imageVisibility>[0];

describe('imageVisibility', () => {
  it('sagt „sichtbar", wenn ein Bild anhängt und nichts dagegen spricht', () => {
    expect(imageVisibility(state({}))).toBe('visible');
  });

  it('sagt „none" ohne Bilder — die Frage stellt sich dann nicht', () => {
    expect(imageVisibility(state({ imageAttachments: [] }))).toBe('none');
    expect(imageVisibility(state({ imageAttachments: undefined }))).toBe('none');
  });

  it('hält die abgewählte Bildanalyse fest (#3307)', () => {
    expect(imageVisibility(state({ enabledTools: { vision: false } }))).toBe('vision_off');
  });

  it('nennt bei image_edit die Bearbeitung als Grund', () => {
    // Die Rohbytes bleiben dort bewusst draußen; der Prompt darf trotzdem nicht
    // behaupten, das Modell sähe sie. Ob es ERSATZ hat (BILDVERGLEICH), sagt
    // dieser Wert bewusst nicht — die Beschreibungen dürfen fehlschlagen.
    expect(imageVisibility(state({ intent: 'image_edit' }))).toBe('image_edit');
  });

  it('nennt den ausdrücklichen Schalter zuerst, wenn beide Gründe zutreffen', () => {
    // Beide Male kommen keine Bytes an — aber wer „Bildanalyse" abwählt, soll
    // das im Prompt wiederfinden und nicht die Erklärung eines anderen Zweigs.
    expect(imageVisibility(state({ intent: 'image_edit', enabledTools: { vision: false } }))).toBe(
      'vision_off'
    );
  });

  it('liest ein ausdrückliches vision: true wie das Fehlen des Schlüssels', () => {
    // Die Datensatz-Semantik des ganzen Pfads ist `!== false`.
    expect(imageVisibility(state({ enabledTools: { vision: true } }))).toBe('visible');
  });
});
