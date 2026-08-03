import { describe, it, expect, beforeAll } from 'vitest';

import { loadCanvasConfig } from '../configLoader';
import { TEMPLATE_REGISTRY } from '../../utils/templateRegistry';

/**
 * Sharepics gehen als Instagram-Beitrag raus, also 4:5. Freeform war als
 * einziges Gestaltungs-Sujet quadratisch geblieben; dieser Guard hält alle
 * Sujets auf demselben Blatt, statt sich auf Sichtprüfung zu verlassen.
 */
const INSTAGRAM = { width: 1080, height: 1350 } as const;

/** Ein Profilbild ist quadratisch — das ist kein Ausrutscher, sondern der Zweck. */
const QUADRATISCH = new Set(['profilbild']);

describe('Leinwandformate', () => {
  const ids = Object.keys(TEMPLATE_REGISTRY) as Array<keyof typeof TEMPLATE_REGISTRY>;

  // Dieselbe Ruestzeit wie in at-configs.vitest.ts: der erste dynamische Import
  // zieht die gesamte Konva-Kette nach. Solange er im ersten Testfall lag, trug
  // ein einzelner Fall die Last des ganzen Blocks und riss die 20 s unter
  // Volllast — hier beobachtet, seit ein weiteres Sujet in der Registry steht.
  beforeAll(async () => {
    await loadCanvasConfig(ids[0]);
  }, 120_000);

  it.each(ids)(
    '%s liegt im Instagram-Hochformat',
    async (id) => {
      const config = await loadCanvasConfig(id);
      if (QUADRATISCH.has(id)) {
        expect(config.canvas.width).toBe(config.canvas.height);
        return;
      }
      expect({ width: config.canvas.width, height: config.canvas.height }).toEqual(INSTAGRAM);
    },
    20_000
  );
});
