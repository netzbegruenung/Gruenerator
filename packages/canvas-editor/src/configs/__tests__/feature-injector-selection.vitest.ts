import { describe, it, expect } from 'vitest';

import { injectFeatureProps } from '../featureInjector';

const noop = () => {};
const state = {
  frameInstances: [{ id: 'frame-1' }],
  illustrationInstances: [{ id: 'ill-1' }],
};
const actions = { addFrame: noop, addIllustration: noop };

describe('injectFeatureProps: selectedFrameId', () => {
  it('ist nur bei einem ausgewählten Rahmen gesetzt', () => {
    expect(injectFeatureProps(state, actions, { selectedElement: 'frame-1' }).selectedFrameId).toBe(
      'frame-1'
    );
  });

  // Eine Illustration öffnete sonst mobil den Rahmen-Katalog (MobileCatalogView).
  it('bleibt bei einer Illustration leer', () => {
    expect(
      injectFeatureProps(state, actions, { selectedElement: 'ill-1' }).selectedFrameId
    ).toBeNull();
  });
});
