import { describe, it, expect } from 'vitest';

import { imageRenderInputsAreEqual } from '../imageElementComparison';

import type { ImageElementConfig, LayoutResult } from '../../configs/types';

type State = Record<string, unknown>;

const arrowConfig: ImageElementConfig<State> = {
  id: 'arrow',
  type: 'image',
  x: 50,
  y: 400,
  order: 3,
  width: 60,
  height: 60,
  src: '/arrow_right.svg',
  draggable: true,
  opacityStateKey: 'arrowOpacity',
  positionStateKey: 'arrowPosition',
  sizeStateKey: 'arrowSize',
};

const layoutWithArrowY = (y: number): LayoutResult => ({
  arrow: { x: 50, y, width: 60, height: 60 },
});

const inputs = (state: State, layout: LayoutResult, selected = false) => ({
  config: arrowConfig,
  state,
  layout,
  selected,
});

describe('imageRenderInputsAreEqual', () => {
  it('zeichnet neu, wenn das Layout das Bild verschiebt', () => {
    // Der eigentliche Befund: die Ueberschrift wird laenger, `arrowY` waechst,
    // Kopf- und Fliesstext wandern mit — der Pfeil blieb stehen.
    const equal = imageRenderInputsAreEqual(
      inputs({}, layoutWithArrowY(280)),
      inputs({}, layoutWithArrowY(360))
    );

    expect(equal).toBe(false);
  });

  it('zeichnet neu, wenn das Layout die Groesse aendert', () => {
    const equal = imageRenderInputsAreEqual(
      inputs({}, { arrow: { x: 50, y: 280, width: 60 } }),
      inputs({}, { arrow: { x: 50, y: 280, width: 80 } })
    );

    expect(equal).toBe(false);
  });

  it('haelt still, wenn sich nichts Sichtbares aendert', () => {
    const layout = layoutWithArrowY(280);
    const equal = imageRenderInputsAreEqual(
      inputs({ header: 'a' }, layout),
      inputs({ header: 'b' }, layout)
    );

    expect(equal).toBe(true);
  });

  it('zeichnet neu, wenn eine manuelle Position gesetzt oder geloescht wird', () => {
    const layout = layoutWithArrowY(280);

    expect(
      imageRenderInputsAreEqual(
        inputs({}, layout),
        inputs({ arrowPosition: { x: 90, y: 300 } }, layout)
      )
    ).toBe(false);

    expect(
      imageRenderInputsAreEqual(
        inputs({ arrowPosition: { x: 90, y: 300 } }, layout),
        inputs({}, layout)
      )
    ).toBe(false);
  });

  it('zeichnet neu, wenn die manuelle Position wandert', () => {
    const layout = layoutWithArrowY(280);
    const equal = imageRenderInputsAreEqual(
      inputs({ arrowPosition: { x: 90, y: 300 } }, layout),
      inputs({ arrowPosition: { x: 90, y: 301 } }, layout)
    );

    expect(equal).toBe(false);
  });

  it('zeichnet neu, wenn eine manuelle Groesse ankommt', () => {
    const layout = layoutWithArrowY(280);
    const equal = imageRenderInputsAreEqual(
      inputs({ arrowSize: { w: 60, h: 60 } }, layout),
      inputs({ arrowSize: { w: 90, h: 90 } }, layout)
    );

    expect(equal).toBe(false);
  });

  it('zeichnet neu bei Auswahl', () => {
    const layout = layoutWithArrowY(280);
    expect(imageRenderInputsAreEqual(inputs({}, layout, false), inputs({}, layout, true))).toBe(
      false
    );
  });
});
