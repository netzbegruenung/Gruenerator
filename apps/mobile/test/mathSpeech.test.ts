import { describe, it, expect } from '@jest/globals';

import { texToSvg } from '../components/chat/math/texToSvg';

const speech = (tex: string) => texToSvg(tex, true)?.speech;

describe('math speech (German)', () => {
  const cases: Array<[string, string]> = [
    ['\\sum_{k=1}^{7} n_k d_k', 'Summe von k gleich 1 bis 7 über n Index k d Index k'],
    ['\\frac{a}{b}', 'a durch b'],
    ['x^2+y^2=r^2', 'x Quadrat plus y Quadrat ist gleich r Quadrat'],
    ['E=mc^2', 'großes E ist gleich m c Quadrat'],
    ['x^3', 'x hoch 3'],
    ['a_{n+1}', 'a Index n plus 1 Ende Index'],
    ['\\frac{x+1}{y-2}', 'Bruch: Zähler x plus 1, Nenner y minus 2'],
    ['\\int_0^1 x\\,dx', 'Integral von 0 bis 1 x d x'],
    ['\\sqrt{x}', 'Wurzel aus x'],
    ['\\sqrt[3]{x+1}', 'dritte Wurzel aus x plus 1'],
    ['\\alpha \\le \\pi \\approx 3.14', 'Alpha kleiner oder gleich Pi ungefähr gleich 3,14'],
    ['5\\% \\to \\infty', '5 Prozent Pfeil nach rechts unendlich'],
    ['\\lim_{x \\to 0} f(x)', 'Limes für x gegen 0 f Klammer auf x Klammer zu'],
    ['\\overline{x} \\pm 1', 'x quer plus minus 1'],
    ['\\text{CO}_2 = 3', 'CO Index 2 ist gleich 3'],
  ];

  it.each(cases)('%s', (tex, expected) => {
    expect(speech(tex)).toBe(expected);
  });

  it('reads a matrix row by row', () => {
    expect(speech('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}')).toContain(
      'Zeile 1: 1, 2. Zeile 2: 3, 4'
    );
  });

  it('is null for constructs it does not know, while the SVG still renders', () => {
    const svg = texToSvg('\\underbrace{a+b}_{n}', true);
    expect(svg).not.toBeNull();
    expect(svg?.speech).toBeNull();
  });
});
