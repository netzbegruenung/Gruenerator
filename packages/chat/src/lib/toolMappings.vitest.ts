import { describe, expect, it } from 'vitest';

import { toolCountLabel } from './toolMappings';

describe('toolCountLabel', () => {
  it('pluralizes known tools', () => {
    expect(toolCountLabel('gruenerator_search', 1)).toBe('1 Suche');
    expect(toolCountLabel('gruenerator_search', 4)).toBe('4 Suchen');
    expect(toolCountLabel('web_search', 3)).toBe('3 Suchen');
    expect(toolCountLabel('research', 1)).toBe('1 Suche');
  });

  it('uses singular vs plural German labels for created artifacts', () => {
    expect(toolCountLabel('sharepic', 1)).toBe('1 Sharepic');
    expect(toolCountLabel('sharepic', 2)).toBe('2 Sharepics');
    expect(toolCountLabel('generate_image', 1)).toBe('1 Bild');
    expect(toolCountLabel('generate_image', 5)).toBe('5 Bilder');
    expect(toolCountLabel('create_presentation', 1)).toBe('1 Präsentation');
    expect(toolCountLabel('create_presentation', 2)).toBe('2 Präsentationen');
    expect(toolCountLabel('create_sheet', 1)).toBe('1 Tabelle');
    expect(toolCountLabel('create_sheet', 2)).toBe('2 Tabellen');
    expect(toolCountLabel('create_document', 1)).toBe('1 Dokument');
    expect(toolCountLabel('create_document', 2)).toBe('2 Dokumente');
    expect(toolCountLabel('save_as_doc', 2)).toBe('2 Dokumente');
  });

  it('handles scrape_url as a special-cased phrase, not a bare noun', () => {
    expect(toolCountLabel('scrape_url', 1)).toBe('1 Webseite gelesen');
    expect(toolCountLabel('scrape_url', 3)).toBe('3 Webseiten gelesen');
  });

  it('routes namespaced MCP tools through formatNamespacedToolLabel', () => {
    expect(toolCountLabel('bahn__get_planned_timetable', 2)).toBe(
      'Deutsche Bahn · get_planned_timetable ×2'
    );
    expect(toolCountLabel('s3__search', 1)).toBe('search ×1');
  });

  it('falls back to raw tool name with a ×N counter for unknown tools', () => {
    expect(toolCountLabel('some_future_tool', 2)).toBe('some_future_tool ×2');
  });
});
