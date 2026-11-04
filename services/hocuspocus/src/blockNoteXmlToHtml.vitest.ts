import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

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

describe('blockNoteXmlToHtml — real Y.XmlFragment output', () => {
  // Yjs lowercases element names in toString(), so the fixture is built as a
  // real fragment instead of hand-written camelCase XML (see #4867).
  function fragmentXml(
    blocks: Array<{ name: string; attributes?: Record<string, string>; text: string }>
  ): string {
    const fragment = new Y.Doc().getXmlFragment('document-store');
    for (const block of blocks) {
      const container = new Y.XmlElement('blockContainer');
      container.setAttribute('id', block.name + '-id');
      fragment.push([container]);
      const element = new Y.XmlElement(block.name);
      for (const [key, value] of Object.entries(block.attributes ?? {})) {
        element.setAttribute(key, value);
      }
      container.push([element]);
      element.push([new Y.XmlText(block.text)]);
    }
    return fragment.toString();
  }

  it('converts lists and strips block wrappers from lowercased Yjs output', () => {
    const xml = fragmentXml([
      { name: 'heading', attributes: { level: '1' }, text: 'Titel' },
      { name: 'bulletlistitem', text: 'eins' },
      { name: 'bulletlistitem', text: 'zwei' },
      { name: 'numberedlistitem', text: 'drei' },
      { name: 'paragraph', text: 'Ende' },
    ]);
    expect(xml).toContain('<bulletlistitem');
    expect(blockNoteXmlToHtml(xml)).toBe(
      '<h1>Titel</h1><ul><li>eins</li><li>zwei</li></ul><ol><li>drei</li></ol><p>Ende</p>'
    );
  });
});
