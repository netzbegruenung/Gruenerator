/**
 * What #5201 left on the first registered pack and an Austrian canvas showed
 * in German colours: the shape tiles (#5199), the chart tiles, swatch names
 * and the text marker. Each case renders or calls with the AT pack and checks
 * that no German value comes out. The tests register `[GRUENE_DE, GRUENE_AT]`
 * like apps/web, so `activeBrand()` is the German pack throughout.
 */
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { DocumentBrandContext } from '@ggraphic/editor/brand/documentBrand';
import { Marker } from '@ggraphic/editor/components/markerMark';
import { shapeItems } from '@ggraphic/editor/sidebar/sections/assets/useElementCatalog';
import { ChartTypePreview } from '@ggraphic/editor/sidebar/sections/DiagrammeSection';
import {
  getShapeVariant,
  ALL_PALETTE_SHAPES,
} from '@ggraphic/editor/sidebar/sections/FormenSection';
import { colorName } from '@ggraphic/editor/utils/colorNames';
import { markerBoxes } from '@ggraphic/editor/utils/markerBoxes';
import { defaultTextMarker, markerInkOn } from '@ggraphic/editor/utils/markerColors';
import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { beforeAll, describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE } from '../theme';

const lower = (values: readonly string[]) => values.map((v) => v.toLowerCase());
const AT_PALETTE = lower(GRUENE_AT.palette.map((c) => c.color));
const DE_ONLY = lower(GRUENE_DE.palette.map((c) => c.color)).filter(
  (value) => !AT_PALETTE.includes(value)
);

beforeAll(() => {
  registerBrandPacks([GRUENE_DE, GRUENE_AT]);
});

describe('shape tiles cycle the colours of the document brand (#5199)', () => {
  const cycle = (brand: typeof GRUENE_DE) =>
    ALL_PALETTE_SHAPES.filter((s) => !s.id.startsWith('hand-marker')).map((s) =>
      getShapeVariant(s.id, brand).color.toLowerCase()
    );

  it('AT: its own four colours, none of them German', () => {
    const colors = cycle(GRUENE_AT);
    expect(new Set(colors)).toEqual(new Set(['#257639', '#56af31', '#fcec00', '#e4007c']));
  });

  it('DE: unchanged, Tanne first', () => {
    expect(cycle(GRUENE_DE).slice(0, 5)).toEqual([
      '#005538',
      '#008939',
      '#8abd24',
      '#0ba1dd',
      '#6ccd87',
    ]);
  });

  it('a text-marker shape takes the first marker box of the pack', () => {
    expect(getShapeVariant('hand-marker', GRUENE_AT).color).toBe('#FCEC00');
  });

  it('the Elemente tiles insert what they show', () => {
    for (const item of shapeItems(GRUENE_AT)) {
      if (item.action.kind !== 'shape') throw new Error('not a shape tile');
      expect(DE_ONLY).not.toContain(item.action.color?.toLowerCase());
    }
  });
});

describe('chart tiles draw the chart series of the document brand', () => {
  it('AT', () => {
    const { container } = render(
      <DocumentBrandContext.Provider value={GRUENE_AT}>
        <ChartTypePreview type="bar" />
      </DocumentBrandContext.Provider>
    );
    const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills.slice(0, 3)).toEqual(GRUENE_AT.chart.slice(0, 3));
  });
});

describe('swatch names', () => {
  it('name an Austrian colour', () => {
    expect(colorName('#FCEC00', GRUENE_AT)).toBe('Gelb');
  });

  it('keep the name another pack gives a shared effect swatch', () => {
    expect(colorName('#005538', GRUENE_AT)).toBe('Tanne');
  });
});

describe('text markers ink and box in the document brand', () => {
  it('a freely picked light box gets the dark ink of the pack', () => {
    expect(markerInkOn('#FFFFFF', GRUENE_AT)).toBe(GRUENE_AT.markers.ink);
    expect(markerInkOn('#FFFFFF', GRUENE_DE)).toBe(GRUENE_DE.markers.ink);
  });

  it('markerBoxes passes the pack through to the ink', () => {
    const line = {
      indent: 0,
      runs: [{ text: 'Hallo', x: 0, width: 50, marker: true, markerColor: '#FFFFFF' }],
    };
    const [box] = markerBoxes([line] as never, () => 10, defaultTextMarker(GRUENE_AT), {
      fontSize: 40,
      lineHeightPx: 48,
      top: 0,
      originX: [0],
      brand: GRUENE_AT,
    });
    expect(box?.ink).toBe(GRUENE_AT.markers.ink);
  });

  it('the editing view writes the ink of the configured pack', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Marker.configure({ brand: GRUENE_AT })],
      content: '<p><mark data-marker data-color="#FFFFFF">Hallo</mark></p>',
    });
    expect(editor.getHTML()).toContain(`--mark-ink: ${GRUENE_AT.markers.ink}`);
    editor.destroy();
  });
});
