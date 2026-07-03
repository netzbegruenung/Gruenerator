/**
 * Tests for detectPyodidePackages — per-need package detection from imports.
 */

import { describe, expect, it } from 'vitest';

import { detectPyodidePackages } from './pyodidePackages';

describe('detectPyodidePackages', () => {
  it('returns nothing for a stdlib-only snippet (e.g. character counting)', () => {
    expect(detectPyodidePackages('text = "Hallo"\nprint(len(text))')).toEqual([]);
  });

  it('does NOT load a wheel for stdlib modules (re, json, math, statistics)', () => {
    expect(detectPyodidePackages('import re, json, math, statistics')).toEqual([]);
  });

  it('detects pandas + matplotlib (incl. dotted import)', () => {
    const pkgs = detectPyodidePackages('import pandas as pd\nimport matplotlib.pyplot as plt');
    expect(pkgs).toContain('pandas');
    expect(pkgs).toContain('matplotlib');
  });

  it('maps sklearn → scikit-learn', () => {
    expect(detectPyodidePackages('from sklearn import linear_model')).toContain('scikit-learn');
  });

  it('detects the statistics/symbolic-math set (scipy, sympy)', () => {
    const code = ['import scipy.stats', 'import sympy'].join('\n');
    expect(detectPyodidePackages(code).sort()).toEqual(['scipy', 'sympy']);
  });

  it('does not return not-yet-vendored packages (seaborn, openpyxl, requests)', () => {
    const code = ['import seaborn', 'import openpyxl', 'import requests'].join('\n');
    expect(detectPyodidePackages(code)).toEqual([]);
  });

  it('does not match a package name that only appears inside other code, not an import', () => {
    expect(detectPyodidePackages('x = "use pandas later"\nprint(x)')).toEqual([]);
  });

  it('dedupes repeated imports', () => {
    expect(detectPyodidePackages('import numpy\nimport numpy as np')).toEqual(['numpy']);
  });
});
