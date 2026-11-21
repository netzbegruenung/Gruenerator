import { describe, expect, it } from 'vitest';

import { editorAppSrc } from './editorAppSrc';

describe('editorAppSrc', () => {
  it('forwards parteitagRede', () => {
    expect(editorAppSrc('?parteitagRede=abc&x=1', null)).toBe(
      '/videoeditor/app/?parteitagRede=abc'
    );
  });

  it('forwards the KI-Schnitt project and version, nothing else', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(editorAppSrc(`?ki=${id}&v=2&evil=1`, null)).toBe(`/videoeditor/app/?ki=${id}&v=2`);
    expect(editorAppSrc('?foo=bar', null)).toBe('/videoeditor/app/');
  });

  it('forwards the subtitler project of a „Bearbeiten“ hand-off', () => {
    expect(editorAppSrc('?untertitel=p1', 's-abc123')).toBe(
      '/videoeditor/app/?untertitel=p1&projekt=s-abc123'
    );
  });

  it('returns the bare path without params', () => {
    expect(editorAppSrc('', null)).toBe('/videoeditor/app/');
  });

  it('appends the project slug and ignores a projekt param from the query', () => {
    expect(editorAppSrc('?ki=a&v=2&x=1', 'neues-video-abc123')).toBe(
      '/videoeditor/app/?ki=a&v=2&projekt=neues-video-abc123'
    );
    expect(editorAppSrc('?projekt=evil', 's-abc123')).toBe('/videoeditor/app/?projekt=s-abc123');
  });
});
