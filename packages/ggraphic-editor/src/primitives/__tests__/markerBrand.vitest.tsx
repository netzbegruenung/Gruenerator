// SPDX-License-Identifier: MPL-2.0
/**
 * The default marker of a text without a marker style comes from the brand of
 * the DOCUMENT, in the toolbar swatch and on the canvas alike. The toolbar read
 * `useDocumentBrand()` while the renderer read `activeBrand()` (the first
 * registered pack, German in the host), so an Austrian document showed one
 * colour on the swatch and drew another on the page.
 */
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DocumentBrandContext } from '@ggraphic/editor/brand/documentBrand';
import { preloadRichText } from '@ggraphic/editor/components/CanvasTextOverlay';
import { RichTextField } from '@ggraphic/editor/components/RichTextField';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';

/** A pack whose marker (box and ink) matches nothing the default pack has. */
const OTHER_BRAND: BrandPack = {
  ...brandDefault,
  markers: {
    swatches: [
      { id: 'gelb', label: 'Gelb', color: '#FFE600' },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    ],
    ink: '#1A3D5C',
  },
};
const OTHER_BOX = '#FFE600';
const OTHER_INK = '#1A3D5C';
const DEFAULT_BOX = brandDefault.markers.swatches[0]!.color;
const DEFAULT_INK = brandDefault.markers.ink;

beforeAll(() => preloadRichText());
afterEach(cleanup);

function mount(text: string, brand: BrandPack | null, editable = false) {
  // Not drawn: the canvas driver of the test environment has no shadow buffer.
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  render(
    <DocumentBrandContext.Provider value={brand}>
      <CanvasStage ref={stageRef} width={600} height={600}>
        <CanvasText
          id="t"
          text={text}
          x={10}
          y={10}
          width={500}
          fontSize={24}
          fontFamily="PT Sans, Arial, sans-serif"
          fill="#FFFFFF"
          marker={null}
          editable={editable}
          onTextChange={() => {}}
        />
      </CanvasStage>
    </DocumentBrandContext.Provider>
  );
  return stageRef.current!.getStage()!;
}

/** The fills of the rects that are painted: the marker boxes, not the hit areas. */
const boxFills = (stage: Konva.Stage) =>
  stage
    .find('Rect')
    .map((rect) => (rect as Konva.Rect).fill())
    .filter((fill): fill is string => typeof fill === 'string' && fill !== 'transparent');
const runFill = (stage: Konva.Stage, needle: string) =>
  (
    stage.find('Text').find((node) => (node as Konva.Text).text().includes(needle)) as Konva.Text
  ).fill();

/** The colour bar under the "Textmarker" button, as the browser normalises it. */
const toolbarSwatch = () =>
  screen.getByRole('button', { name: 'Textmarker' }).querySelector<HTMLElement>('span > span')!
    .style.backgroundColor;
const asComputed = (hex: string) => {
  const probe = document.createElement('span');
  probe.style.backgroundColor = hex;
  return probe.style.backgroundColor;
};

describe('a document of another brand', () => {
  it('draws a marker run without a colour in the default box and ink of that brand', () => {
    const stage = mount('Ich will ++frei atmen++ können', OTHER_BRAND);
    expect(boxFills(stage)).toContain(OTHER_BOX);
    expect(boxFills(stage)).not.toContain(DEFAULT_BOX);
    expect(runFill(stage, 'frei')).toBe(OTHER_INK);
  });

  it('sets a run with its own box colour in the ink of that brand', () => {
    const stage = mount('Ich will ++{#FFE600}frei++ atmen', OTHER_BRAND);
    expect(boxFills(stage)).toContain('#FFE600');
    expect(runFill(stage, 'frei')).toBe(OTHER_INK);
  });

  it('opens the editor on the same box colour as the toolbar swatch and the page', () => {
    const stage = mount('Ich will ++frei++ atmen', OTHER_BRAND, true);
    const drawn = boxFills(stage)[0];
    act(() => {
      stage.findOne('#t')!.fire('dblclick');
    });

    expect(drawn).toBe(OTHER_BOX);
    expect(toolbarSwatch()).toBe(asComputed(drawn!));
    const field = document.querySelector<HTMLElement>('[style*="--canvas-rte-marker-fill"]')!;
    expect(field.style.getPropertyValue('--canvas-rte-marker-fill')).toBe(drawn);
    expect(field.style.getPropertyValue('--canvas-rte-marker-color')).toBe(OTHER_INK);
  });
});

describe('the editing field of a document of another brand', () => {
  const inkOf = (brand: BrandPack | null) => {
    const { container } = render(
      <DocumentBrandContext.Provider value={brand}>
        <RichTextField value="++{#FFE600}frei++ atmen" onChange={() => {}} />
      </DocumentBrandContext.Provider>
    );
    return container.querySelector('mark[data-marker]')?.getAttribute('style');
  };

  it('sets a run with its own box colour in the ink of that brand', () => {
    expect(inkOf(OTHER_BRAND)).toContain(`--mark-ink: ${OTHER_INK}`);
  });

  it('keeps the ink of the default pack where no brand is given', () => {
    expect(inkOf(null)).toContain(`--mark-ink: ${DEFAULT_INK}`);
  });
});

describe('a document without a brand of its own', () => {
  it.each([[null], [brandDefault]])('keeps the default pack (%#)', (brand) => {
    const stage = mount('Ich will ++frei atmen++ können', brand);
    expect(boxFills(stage)).toContain(DEFAULT_BOX);
    expect(runFill(stage, 'frei')).toBe(DEFAULT_INK);
  });

  it('shows the default box on the toolbar swatch, as it always did', () => {
    const stage = mount('Ich will ++frei++ atmen', null, true);
    act(() => {
      stage.findOne('#t')!.fire('dblclick');
    });
    expect(toolbarSwatch()).toBe(asComputed(DEFAULT_BOX));
  });
});
