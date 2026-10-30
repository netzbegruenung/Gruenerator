import { describe, expect, it } from 'vitest';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

describe('serverMeasureText', () => {
  it('measures a real headline with the registered brand font', async (t) => {
    if (!(await prepareOverflowMeasuring('de-DE'))) t.skip();
    const measure = serverMeasureText('de-DE');
    if (!measure) return t.skip();

    const head = { family: 'GrueneTypeNeue', size: 200, lineHeight: 1 };
    const text = 'Mehr Radwege für alle';

    expect(measure(text, head, 100000).height).toBe(200);
    const narrow = measure(text, head, 900).height;
    expect(narrow).toBeGreaterThanOrEqual(400);
    expect(narrow % 200).toBe(0);
    // Die Fließschrift ist schmaler als die Display-Schrift: gleicher Text, gleiche Breite, nie höher.
    const body = measure(text, { ...head, family: 'PT Sans' }, 900).height;
    expect(body).toBeLessThanOrEqual(narrow);
  });
});
