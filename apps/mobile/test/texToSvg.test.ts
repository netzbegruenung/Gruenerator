import { describe, it, expect } from '@jest/globals';

import { texToSvg } from '../components/chat/math/texToSvg';

describe('texToSvg', () => {
  it('sizes the SVG in em from the viewBox', () => {
    const svg = texToSvg('x', true);
    // MathJax draws `x` in a 572 × 453 viewBox at 1000 units per em.
    expect(svg?.width).toBeCloseTo(0.572);
    expect(svg?.height).toBeCloseTo(0.453);
    expect(svg?.ast.props).not.toHaveProperty('style');
  });

  it('returns null for TeX that MathJax rejects', () => {
    expect(texToSvg('\\frac{a}{', true)).toBeNull();
    expect(texToSvg('\\undefinedmacro x', true)).toBeNull();
  });

  it('renders chemistry and text macros', () => {
    expect(texToSvg('\\ce{H2O + CO2 -> H2CO3}', true)).not.toBeNull();
    expect(texToSvg('\\text{Größe} = \\boldsymbol{v}', true)).not.toBeNull();
  });

  it('returns the cached result for the same TeX', () => {
    expect(texToSvg('E = mc^2', true)).toBe(texToSvg('E = mc^2', true));
  });
});
