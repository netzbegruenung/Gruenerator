import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ExtendedAssetsSectionProps } from '../../sidebar/sections/assets';
import type { AssetInstance } from '@ggraphic/editor/utils/canvasAssets';

/**
 * The Sticker card adds gallery stickers through `onAddStickerAsset`. A config
 * that passes `onAddAsset` but not this one shows the card without Entdecken /
 * Meine / Gemerkt — no error, the lists are just missing. Freitext-Sharepic
 * pages use these same configs.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];
type State = Record<string, unknown> & { assetInstances: AssetInstance[] };

/** Every template with an elements sidebar, and the section key it lives under. */
const TEMPLATES: [CanvasConfigType, 'assets' | 'elements'][] = [
  ['zitat-pure', 'assets'],
  ['info', 'assets'],
  ['veranstaltung', 'assets'],
  ['simple', 'assets'],
  ['dreizeilen', 'assets'],
  ['zitat', 'assets'],
  ['slider', 'assets'],
  ['freeform', 'elements'],
  ['profilbild', 'elements'],
  ['zitat-at', 'assets'],
  ['zitat-pure-at', 'assets'],
  ['dreizeilen-overlay-at', 'assets'],
  ['info-at', 'assets'],
  ['freeform-at', 'elements'],
  ['slider-at', 'assets'],
];

const UUID = '0b6f7a8e-3c2d-4e5f-9a1b-2c3d4e5f6a7b';
const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

describe.each(TEMPLATES)('%s', (template, sectionKey) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(template);
  }, 120_000);

  const harness = () => {
    let state = config.createInitialState({}) as State;
    const actions = config.createActions(
      () => state,
      (partial) => {
        state =
          typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
      },
      () => {},
      () => {},
      {}
    );
    return { actions, current: () => state };
  };

  it('adds a gallery sticker wherever stickers can be added', () => {
    const { actions, current } = harness();
    const entry = config.sections[sectionKey];
    const props = entry.propsFactory(current(), actions, undefined) as ExtendedAssetsSectionProps;

    expect(props.onAddAsset).toBeTypeOf('function');
    expect(props.onAddStickerAsset).toBeTypeOf('function');
    const before = current().assetInstances.length;
    props.onAddStickerAsset!({ id: `asset:${UUID}`, src: SRC });

    const added = current().assetInstances;
    expect(added).toHaveLength(before + 1);
    expect(added.at(-1)).toMatchObject({ assetId: `asset:${UUID}`, src: SRC });
  });
});
