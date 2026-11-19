import { describe, expect, it } from 'vitest';

import { editorAppSrc } from './editorAppSrc';

describe('editorAppSrc', () => {
  it('forwards parteitagRede', () => {
    expect(editorAppSrc('?parteitagRede=abc&x=1')).toBe('/videoeditor/app/?parteitagRede=abc');
  });

  it('forwards the KI-Schnitt project and version, nothing else', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(editorAppSrc(`?ki=${id}&v=2&evil=1`)).toBe(`/videoeditor/app/?ki=${id}&v=2`);
    expect(editorAppSrc('?foo=bar')).toBe('/videoeditor/app/');
  });

  it('returns the bare path without params', () => {
    expect(editorAppSrc('')).toBe('/videoeditor/app/');
  });
});
