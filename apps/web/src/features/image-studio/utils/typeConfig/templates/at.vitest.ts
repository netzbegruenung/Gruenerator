/**
 * Die österreichischen Vorlagen, an der Naht zwischen Textantwort und Leinwand.
 *
 * `responseMapping` ist die Stelle, an der die Felder des AT-Prompts auf die
 * Feldnamen der AT-Leinwand umgeschrieben werden — und dort steckt genau eine
 * Umbenennung, die man beim Lesen übersieht: die gelbe Mittelzeile des
 * Dreizeilers heisst auf der Leinwand `accent`, nicht `line2`. Bleibt sie
 * unübersetzt, mintet das Studio ein Sujet mit leerer Mittelzeile, ohne dass
 * irgendetwas fehlschlägt.
 */
import { describe, expect, it } from 'vitest';

import { CANVAS_TEMPLATE_FIELDS } from '@gruenerator/contracts';

import { IMAGE_STUDIO_TYPES } from '../constants';

import {
  dreizeilenOverlayAtFieldConfig,
  dreizeilenOverlayAtTypeConfig,
  freeformAtTypeConfig,
  infoAtFieldConfig,
  infoAtTypeConfig,
  zitatAtFieldConfig,
  zitatAtTypeConfig,
  zitatPureAtTypeConfig,
} from './at';

describe('AT-Vorlagen: Textantwort → Leinwandfelder', () => {
  it('dreizeilen-overlay-at: line2 wird zur gelben accent-Zeile', () => {
    const mapped = dreizeilenOverlayAtFieldConfig.responseMapping?.({
      mainSlogan: {
        line1: 'Mehr Windkraft',
        line2: 'für Österreich',
        line3: 'und für uns',
        subline: 'Ausbau bis 2030',
      },
      searchTerms: ['windrad'],
    });

    expect(mapped).toMatchObject({
      line1: 'Mehr Windkraft',
      accent: 'für Österreich',
      line3: 'und für uns',
      subline: 'Ausbau bis 2030',
    });
    expect(mapped).not.toHaveProperty('line2');
  });

  it('info-at: introline/text/accent, nicht header/subheader/body', () => {
    const mapped = infoAtFieldConfig.responseMapping?.({
      introline: 'Windkraft',
      text: 'Jedes neue Windrad macht uns',
      accent: 'unabhängiger.',
    });

    expect(mapped).toMatchObject({
      introline: 'Windkraft',
      text: 'Jedes neue Windrad macht uns',
      accent: 'unabhängiger.',
    });
    expect(mapped).not.toHaveProperty('header');
  });

  it('zitat-at: das Zitat, den Namen tippt die Person selbst', () => {
    expect(zitatAtFieldConfig.responseMapping?.({ quote: 'Ein Zitat.' })).toMatchObject({
      quote: 'Ein Zitat.',
    });
  });

  /**
   * Die Felder, die `responseMapping` schreibt, MÜSSEN die sein, die der
   * Mint-Pfad wieder ausliest (`buildInitialState` läuft über
   * `CANVAS_TEMPLATE_FIELDS[typ].fields` und holt sie namentlich aus dem
   * Store). Driftet eines der beiden, bleibt das Sujet leer statt zu brechen.
   */
  it.each([
    [IMAGE_STUDIO_TYPES.DREIZEILEN_OVERLAY_AT, dreizeilenOverlayAtFieldConfig],
    [IMAGE_STUDIO_TYPES.INFO_AT, infoAtFieldConfig],
  ])('%s: gemappte Felder decken die Leinwandfelder', (canvasType, fieldConfig) => {
    const mapped = Object.keys(
      fieldConfig.responseMapping?.({
        mainSlogan: { line1: 'a', line2: 'b', line3: 'c', subline: 'd' },
        introline: 'a',
        text: 'b',
        accent: 'c',
      }) ?? {}
    );

    for (const field of CANVAS_TEMPLATE_FIELDS[canvasType].fields) {
      expect(mapped, `${canvasType} schreibt "${field}" nicht`).toContain(field);
    }
  });
});

describe('AT-Vorlagen: Ablauf', () => {
  it('alle Sujets ausser dem freien Design generieren Text', () => {
    for (const config of [
      zitatAtTypeConfig,
      zitatPureAtTypeConfig,
      dreizeilenOverlayAtTypeConfig,
      infoAtTypeConfig,
    ]) {
      expect(config.hasTextGeneration, config.id).toBe(true);
      expect(config.audience, config.id).toBe('de-AT');
    }

    // Eine leere Leinwand ist der Zweck dieser Vorlage, kein Versäumnis.
    expect(freeformAtTypeConfig.hasTextGeneration).toBe(false);
  });

  /**
   * `zitat-at` ist das einzige AT-Sujet, dessen Leinwand ein Bild VERLANGT.
   * Ohne `requiresImage` gäbe es keinen Upload-Schritt, und das Anlegen der
   * Leinwand scheiterte erst hinterher mit „konnte nicht gespeichert werden".
   */
  it('zitat-at fragt nach dem Bild, das seine Leinwand verlangt', () => {
    expect(CANVAS_TEMPLATE_FIELDS['zitat-at'].image?.required).toBe(true);
    expect(zitatAtTypeConfig.requiresImage).toBe(true);

    expect(CANVAS_TEMPLATE_FIELDS['info-at'].image).toBeUndefined();
    expect(infoAtTypeConfig.requiresImage).toBe(false);
  });
});
