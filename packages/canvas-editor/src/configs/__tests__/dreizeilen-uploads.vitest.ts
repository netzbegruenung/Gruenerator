import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../configLoader';

import type { ToolsSectionProps, UploadsSectionProps } from '../../sidebar/sections';
import type { UserImageInstance } from '../../utils/userImageUtils';

/**
 * Dreizeilen assembled its actions by hand and left out the user-image
 * factory: the Uploads tab rendered nothing and the QR tool asked to add the
 * code to Uploads instead of placing it. The common section entries only wire
 * their handlers when the actions exist, so the tabs went quietly dead.
 */

type State = Record<string, unknown> & { userImageInstances: UserImageInstance[] };

/** Node has no `Image`; the instance factory only needs onload + natural size. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  naturalWidth = 400;
  naturalHeight = 200;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('dreizeilen uploads and tools', () => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    vi.stubGlobal('Image', FakeImage);
    config = await loadCanvasConfig('dreizeilen');
  }, 120_000);
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const harness = () => {
    let state = config.createInitialState({}) as State;
    const history: State[] = [];
    const actions = config.createActions(
      () => state,
      (partial) => {
        state =
          typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
      },
      (s) => history.push(s as State),
      (s) => history.push(s as State),
      {}
    );
    return { actions, history, current: () => state };
  };

  it('starts without placed images', () => {
    expect(harness().current().userImageInstances).toEqual([]);
  });

  it('wires the Uploads and Tools sections to the canvas', () => {
    const { actions, current } = harness();
    const uploads = config.sections.uploads.propsFactory(
      current(),
      actions,
      undefined
    ) as UploadsSectionProps;
    const tools = config.sections.tools.propsFactory(
      current(),
      actions,
      undefined
    ) as ToolsSectionProps;

    expect(uploads.onPlaceFromUrl).toBeTypeOf('function');
    expect(uploads.onPlaceLocalFile).toBeTypeOf('function');
    expect(uploads.onSwapPlacedUrl).toBeTypeOf('function');
    expect(uploads.onRemovePlaced).toBeTypeOf('function');
    expect(tools.onPlaceImageUrl).toBeTypeOf('function');
  });

  it('a tool result lands on the canvas as one undoable step', async () => {
    const { actions, history, current } = harness();
    const tools = config.sections.tools.propsFactory(
      current(),
      actions,
      undefined
    ) as ToolsSectionProps;

    tools.onPlaceImageUrl?.('https://example.org/qr.png', 'qr.png');
    await vi.waitFor(() => expect(current().userImageInstances).toHaveLength(1));

    expect(current().userImageInstances[0]).toMatchObject({
      src: 'https://example.org/qr.png',
      fileName: 'qr.png',
    });
    expect(history.at(-1)?.userImageInstances).toHaveLength(1);
  });
});
