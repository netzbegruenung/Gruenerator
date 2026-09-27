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

  it('haelt still, wenn das Layout wandert und eine manuelle Position gewinnt', () => {
    // Wer den Pfeil einmal verschoben hat, haengt nicht mehr am Layout — ein
    // Neuzeichnen waere folgenlos, weil `customPosition` die Achse besetzt.
    const arrowPosition = { x: 90, y: 300 };
    const equal = imageRenderInputsAreEqual(
      inputs({ arrowPosition }, layoutWithArrowY(280)),
      inputs({ arrowPosition }, layoutWithArrowY(360))
    );

    expect(equal).toBe(true);
  });

  it('zeichnet trotz Positions-Override neu, wenn das Layout die Groesse aendert', () => {
    // Die Groesse haengt weiter am Layout — der Override betrifft nur x/y.
    const arrowPosition = { x: 90, y: 300 };
    const equal = imageRenderInputsAreEqual(
      inputs({ arrowPosition }, { arrow: { x: 50, y: 280, width: 60, height: 60 } }),
      inputs({ arrowPosition }, { arrow: { x: 50, y: 280, width: 90, height: 90 } })
    );

    expect(equal).toBe(false);
  });

  it('behandelt eine Nullgroesse nicht als Override', () => {
    // Der Renderer verwirft {0,0} und faellt aufs Layout zurueck — der
    // Vergleich muss derselben Regel folgen, sonst friert das Bild ein.
    const arrowSize = { w: 0, h: 0 };
    const equal = imageRenderInputsAreEqual(
      inputs({ arrowSize }, { arrow: { x: 50, y: 280, width: 60, height: 60 } }),
      inputs({ arrowSize }, { arrow: { x: 50, y: 280, width: 90, height: 90 } })
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
