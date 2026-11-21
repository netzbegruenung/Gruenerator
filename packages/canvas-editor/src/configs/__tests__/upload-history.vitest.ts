import { loadCanvasConfig } from '@ggraphic/editor/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BUILTIN_TEMPLATES } from '../../templates/registry';

import type { UserImageInstance } from '@ggraphic/editor/elements';

/**
 * A failed upload left an undo step: the blob placeholder was a history entry, and
 * Cmd+Z brought the dead `blob:` image back (in collab: into the shared document).
 * `@ggraphic/editor` hands `createActions` a `history` object as its last argument;
 * the user-image actions only take the placement back / swap the preview in place
 * when they get it. A config that does not forward it silently restores the bug,
 * so every registered template is run through the real actions here.
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

interface UploadActions {
  placeUserImageFromFile: (file: File) => Promise<string>;
  updateUserImage: (id: string, partial: { src?: string }) => void;
  discardPlacedUserImage: (id: string) => void;
}

describe('upload placement and history', () => {
  beforeAll(() => {
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const harness = async (id: (typeof BUILTIN_TEMPLATES)[number]['id']) => {
    const config = await loadCanvasConfig(id);
    let state = config.createInitialState({}) as State;
    const saved: State[] = [];
    const history = { replaceInHistory: vi.fn(), rewriteHistory: vi.fn() };
    const actions = config.createActions(
      () => state as never,
      (partial) => {
        state =
          typeof partial === 'function'
            ? (partial(state as never) as State)
            : { ...state, ...partial };
      },
      (s) => saved.push(s as State),
      (s) => saved.push(s as State),
      {},
      history
    ) as unknown as UploadActions;
    return { actions, history, saved, current: () => state };
  };

  describe.each(BUILTIN_TEMPLATES.map((t) => t.id))('%s', (id) => {
    it('takes a failed upload back out of the history', async () => {
      const { actions, history, saved, current } = await harness(id);
      expect(actions.placeUserImageFromFile).toBeTypeOf('function');
      const placed = await actions.placeUserImageFromFile(new File(['x'], 'a.png'));
      const entriesAfterPlacing = saved.length;

      actions.discardPlacedUserImage(placed);

      expect(history.rewriteHistory).toHaveBeenCalledTimes(1);
      expect(saved).toHaveLength(entriesAfterPlacing);
      expect(current().userImageInstances).toEqual([]);
    });

    it('swaps the blob preview for the durable URL without a step of its own', async () => {
      const { actions, history, saved } = await harness(id);
      const placed = await actions.placeUserImageFromFile(new File(['x'], 'a.png'));
      const entriesAfterPlacing = saved.length;

      actions.updateUserImage(placed, { src: 'https://example.org/a.png' });

      expect(history.replaceInHistory).toHaveBeenCalledWith(
        'blob:test-preview',
        'https://example.org/a.png'
      );
      expect(saved).toHaveLength(entriesAfterPlacing);
    });
  });
});
