import { beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configLoader';

/**
 * The colour templates derive the font colour from the background colour via a
 * palette map. A freely picked colour is not in that map; it used to fall back
 * to the map's first entry blindly — dark text on a dark custom colour.
 */
describe.each(['zitat-pure', 'info'] as const)('%s on a freely picked background', (id) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  const fontColor = (backgroundColor: string) => {
    const state = config.createInitialState({ backgroundColor });
    return (config.calculateLayout(state)._meta as { fontColor: string }).fontColor.toUpperCase();
  };

  it('writes white on a dark colour', () => {
    expect(fontColor('#101820')).toBe('#FFFFFF');
  });

  it('writes a dark colour on a light one', () => {
    expect(fontColor('#FAFAF0')).not.toBe('#FFFFFF');
  });
});
