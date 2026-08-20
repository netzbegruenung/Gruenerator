import { describe, it, expect } from 'vitest';

import {
  calculateCenteredSnapPosition,
  calculateElementSnapPosition,
  createSnapHysteresis,
  type SnapTarget,
} from '../snapping';

const STAGE = 1080;

// Fliesstext der Info-Vorlage: linke Kante bei 125, Oberkante bei 280. Die
// Hoehe ist bewusst gross gewaehlt, damit Mitte und Unterkante desselben Ziels
// in den Faellen unten nicht mit der Oberkante konkurrieren.
const bodyText: SnapTarget = { id: 'body-text', x: 125, y: 280, width: 905, height: 400 };

describe('calculateElementSnapPosition', () => {
  it('faengt die Oberkante eines Nachbarn ein', () => {
    // Pfeil 8px unterhalb der Textoberkante — innerhalb der Schwelle.
    const result = calculateElementSnapPosition(300, 288, 60, 60, [bodyText], STAGE, STAGE);

    expect(result.y).toBe(280);
    expect(result.snapV).toBe(true);
    expect(result.snapToElementId).toBe('body-text');
    expect(result.snapLines).toContainEqual(
      expect.objectContaining({ orientation: 'horizontal', position: 280 })
    );
  });

  it('laesst weit entfernte Elemente in Ruhe', () => {
    const result = calculateElementSnapPosition(300, 900, 60, 60, [bodyText], STAGE, STAGE);

    expect(result.x).toBe(300);
    expect(result.y).toBe(900);
    expect(result.snapV).toBe(false);
    expect(result.snapH).toBe(false);
    expect(result.snapLines).toHaveLength(0);
  });

  it('haelt den eingerasteten Zustand laenger (Hysterese)', () => {
    const hysteresis = createSnapHysteresis();

    calculateElementSnapPosition(300, 288, 60, 60, [bodyText], STAGE, STAGE, hysteresis);
    // 25px entfernt: ohne Hysterese ausserhalb der Schwelle (20), mit drin.
    const held = calculateElementSnapPosition(
      300,
      305,
      60,
      60,
      [bodyText],
      STAGE,
      STAGE,
      hysteresis
    );

    expect(held.snapV).toBe(true);
    expect(held.y).toBe(280);
  });
});

describe('calculateCenteredSnapPosition', () => {
  it('rechnet Mittelpunkt-Koordinaten hin und zurueck', () => {
    // Mittig verankertes Icon (60x60): Mittelpunkt 80/318 = Oberkante 288.
    const result = calculateCenteredSnapPosition(330, 318, 60, 60, [bodyText], STAGE, STAGE);

    // Oberkante rastet auf 280 ein, der Mittelpunkt liegt 30 darunter.
    expect(result.y).toBe(310);
    expect(result.snapV).toBe(true);
  });

  it('rastet mittig auf die Buehnenmitte ein', () => {
    const result = calculateCenteredSnapPosition(535, 200, 60, 60, [], STAGE, STAGE);

    expect(result.x).toBe(STAGE / 2);
    expect(result.snapH).toBe(true);
  });
});
