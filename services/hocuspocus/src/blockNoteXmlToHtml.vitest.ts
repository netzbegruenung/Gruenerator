import { describe, expect, it } from 'vitest';

import { blockNoteXmlToHtml } from './blockNoteXmlToHtml.js';

describe('blockNoteXmlToHtml — track-changes suggestion marks', () => {
  it('drops deleted content entirely (never leaks into export/preview)', () => {
    const xml =
      '<blockContainer><paragraph>Hallo <deletion data-id="1">geloescht</deletion>Welt</paragraph></blockContainer>';
    const html = blockNoteXmlToHtml(xml);
    expect(html).toBe('<p>Hallo Welt</p>');
    expect(html).not.toContain('geloescht');
    expect(html).not.toContain('deletion');
  });

  it('unwraps insertions, keeping the proposed text', () => {
    const xml =
      '<blockContainer><paragraph>Hallo <insertion data-id="2">neu</insertion></paragraph></blockContainer>';
    expect(blockNoteXmlToHtml(xml)).toBe('<p>Hallo neu</p>');
  });

  it('unwraps modifications, keeping the text', () => {
    const xml =
      '<blockContainer><paragraph><modification data-id="3" data-type="modification">Text</modification></paragraph></blockContainer>';
    expect(blockNoteXmlToHtml(xml)).toBe('<p>Text</p>');
  });

  it('removes a deletion that wraps other inline marks', () => {
    const xml =
      '<blockContainer><paragraph>A<deletion data-id="4"><bold>fett</bold> normal</deletion>B</paragraph></blockContainer>';
    const html = blockNoteXmlToHtml(xml);
    expect(html).toBe('<p>AB</p>');
    expect(html).not.toContain('fett');
  });

  it('keeps an inserted mark that is nested inside surviving formatting', () => {
    const xml =
      '<blockContainer><paragraph><bold>A<insertion data-id="5">B</insertion></bold></paragraph></blockContainer>';
    expect(blockNoteXmlToHtml(xml)).toBe('<p><strong>AB</strong></p>');
  });

  it('leaves documents without suggestion marks unchanged (regression)', () => {
    const xml =
      '<blockContainer><heading level="1">Titel</heading></blockContainer>' +
      '<blockContainer><paragraph><bold>fett</bold> und <italic>kursiv</italic></paragraph></blockContainer>';
    expect(blockNoteXmlToHtml(xml)).toBe(
      '<h1>Titel</h1><p><strong>fett</strong> und <em>kursiv</em></p>'
    );
  });
});
