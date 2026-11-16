import { describe, expect, it } from 'vitest';

import { editorAppSrc } from './editorAppSrc';

describe('editorAppSrc', () => {
  it('forwards parteitagRede', () => {
    expect(editorAppSrc('?parteitagRede=abc&x=1')).toBe('/videoeditor/app/?parteitagRede=abc');
  });

  it('returns the bare path without params', () => {
    expect(editorAppSrc('')).toBe('/videoeditor/app/');
  });
});
