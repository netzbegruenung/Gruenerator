import { SHAREPIC_EDITABLE_TEMPLATES, getSharepicTemplateDescriptor } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import { dreizeilenFullConfig } from '../configs/dreizeilen_full.config';
import { dreizeilenOverlayAtFullConfig } from '../configs/dreizeilen_overlay_at_full.config';
import { infoAtFullConfig } from '../configs/info_at_full.config';
import { infoFullConfig } from '../configs/info_full.config';
import { simpleFullConfig } from '../configs/simple_full.config';
import { sliderFullConfig } from '../configs/slider_full.config';
import { veranstaltungFullConfig } from '../configs/veranstaltung_full.config';
import { zitatAtFullConfig } from '../configs/zitat_at_full.config';
import { zitatFullConfig } from '../configs/zitat_full.config';
import { zitatPureAtFullConfig } from '../configs/zitat_pure_at_full.config';
import { zitatPureFullConfig } from '../configs/zitat_pure_full.config';

/** Nur die Felder, um die es hier geht — die Configs sind je Vorlage typisiert. */
interface TextElementShape {
  type: string;
  textKey?: string;
  richText?: boolean;
}

const CONFIGS: Record<string, { elements: TextElementShape[] }> = {
  dreizeilen: dreizeilenFullConfig,
  zitat: zitatFullConfig,
  'zitat-pure': zitatPureFullConfig,
  info: infoFullConfig,
  veranstaltung: veranstaltungFullConfig,
  simple: simpleFullConfig,
  slider: sliderFullConfig,
  'zitat-at': zitatAtFullConfig,
  'zitat-pure-at': zitatPureAtFullConfig,
  'dreizeilen-overlay-at': dreizeilenOverlayAtFullConfig,
  'info-at': infoAtFullConfig,
};

/**
 * `richText` am Descriptor (Contract, liest der Server) und `richText` am
 * Textelement (Editor, zeichnet die Läufe) müssen für JEDE chat-bearbeitbare
 * Vorlage dieselben Felder nennen. Der Server-Test
 * (`multilineFields.vitest.ts`) hängt den KI-Sanitizer an denselben
 * Descriptor — so kann keine der drei Listen still abweichen.
 *
 * Über alle Vorlagen, nicht nur die mit Auszeichnung: sonst fiele genau der
 * Fall durch, bei dem jemand eine neue Vorlage nur auf einer Seite umstellt.
 */
describe('richText: Descriptor ⇔ Textelement', () => {
  for (const type of SHAREPIC_EDITABLE_TEMPLATES) {
    it(type, () => {
      const descriptor = getSharepicTemplateDescriptor(type)!;
      const config = CONFIGS[type];
      expect(config, `keine Config für ${type} — Liste ergänzen`).toBeDefined();
      const textElements = config!.elements.filter((el) => el.type === 'text');

      for (const field of descriptor.textFields) {
        const element = textElements.find((el) => el.textKey === field.stateKey);
        if (!element) {
          // Nicht jedes Textfeld ist ein Textelement (das Slider-Label ist ein
          // Pill-Badge) — aber ein Rich-Text-Feld muss eines sein, sonst
          // zeichnet niemand die Läufe.
          expect(field.richText ?? false, `${type}.${field.field} hat kein Textelement`).toBe(
            false
          );
          continue;
        }
        expect(element.richText ?? false, `${type}.${field.field}`).toBe(field.richText ?? false);
      }
    });
  }
});
