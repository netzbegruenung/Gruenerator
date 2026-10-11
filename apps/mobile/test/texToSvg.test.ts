import { describe, it, expect, jest } from '@jest/globals';

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

  it('renders chemistry with its arrow glyphs, and text macros', () => {
    // Without the mhchem font extension MathJax warns and draws empty boxes.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(texToSvg('\\ce{H2O + CO2 -> H2CO3}', true)).not.toBeNull();
    expect(texToSvg('\\ce{A <=> B}', true)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(texToSvg('\\text{Größe} = \\boldsymbol{v}', true)).not.toBeNull();
  });

  it('returns the cached result for the same TeX', () => {
    expect(texToSvg('E = mc^2', true)).toBe(texToSvg('E = mc^2', true));
  });
});

describe('texToSvg when MathJax cannot load', () => {
  it('returns null instead of throwing, and tries to load only once', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let loads = 0;
    jest.isolateModules(() => {
      jest.doMock('../components/chat/math/mathjaxSvg', () => {
        loads += 1;
        throw new TypeError("Cannot read property 'includes' of undefined");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module registry
      const isolated = require('../components/chat/math/texToSvg') as {
        texToSvg: typeof texToSvg;
      };
      expect(isolated.texToSvg('x', true)).toBeNull();
      expect(isolated.texToSvg('y', true)).toBeNull();
    });
    expect(loads).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
