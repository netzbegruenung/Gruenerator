import { beforeAll, describe, expect, it } from 'vitest';

import { PAGE_PERSISTED_STATE_KEYS } from '../../collab/pageElementStateKeys';
import { HOST_CALLBACK_KEYS } from '../../hostCallbackKeys';
import { loadCanvasConfig } from '../configLoader';

/**
 * Guard for the "kept edit gone after reload" class (#4248).
 *
 * A mounted page rebuilds from `pages[i].state` through `createInitialState`
 * — on reload, on a remote edit and in card renders. A key that function
 * reads back but that nothing writes into the page state is an edit the
 * editor shows and then forgets. A key has a writer when the router declares
 * its `on<Key>Change` for the template (HOST_CALLBACK_KEYS) or when every page
 * mints one (PAGE_PERSISTED_STATE_KEYS).
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

const TEMPLATES = Object.keys(HOST_CALLBACK_KEYS) as CanvasConfigType[];

/** Keys `createInitialState` reads that rightly have no page writer. */
const NOT_PERSISTED: Record<string, string> = {
  // The viewport, not the document.
  isDesktop: 'viewport flag',
  // A File object: cannot live in a Y.Map. Its object URL persists as currentImageSrc.
  backgroundImageFile: 'File object',
  // The seed alias of currentImageSrc (CanvasEditorRouter.buildInitialProps);
  // the edited image persists under currentImageSrc.
  imageSrc: 'seed alias of currentImageSrc',
};

const configs = new Map<CanvasConfigType, Awaited<ReturnType<typeof loadCanvasConfig>>>();

beforeAll(async () => {
  for (const type of TEMPLATES) {
    configs.set(type, await loadCanvasConfig(type));
  }
}, 120_000);

function keysReadBy(type: CanvasConfigType): Set<string> {
  const read = new Set<string>();
  const props = new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (typeof key === 'string') read.add(key);
      return undefined;
    },
    has(_target, key) {
      if (typeof key === 'string') read.add(key);
      return false;
    },
  });
  configs.get(type)!.createInitialState(props);
  return read;
}

const hasWriter = (type: CanvasConfigType, key: string) =>
  HOST_CALLBACK_KEYS[type].includes(key) ||
  (PAGE_PERSISTED_STATE_KEYS as readonly string[]).includes(key);

describe('every key createInitialState reads back has a writer', () => {
  it.each(TEMPLATES)('%s', (type) => {
    const orphans = [...keysReadBy(type)].filter(
      (key) => !hasWriter(type, key) && !(key in NOT_PERSISTED)
    );
    expect(orphans).toEqual([]);
  });

  it('lists no NOT_PERSISTED key that is unread or has a writer after all', () => {
    const dead = Object.keys(NOT_PERSISTED).filter(
      (key) =>
        !TEMPLATES.some((type) => keysReadBy(type).has(key)) ||
        TEMPLATES.some((type) => hasWriter(type, key))
    );
    expect(dead).toEqual([]);
  });

  it('persists no key that no template reads back', () => {
    const unread = PAGE_PERSISTED_STATE_KEYS.filter(
      (key) => !TEMPLATES.some((type) => keysReadBy(type).has(key))
    );
    expect(unread).toEqual([]);
  });
});

describe('the persisted background image is read back', () => {
  // The writer stores the edited image under currentImageSrc; a template that
  // only read the seed alias `imageSrc` dropped it on every remote edit.
  it.each(TEMPLATES.filter((type) => HOST_CALLBACK_KEYS[type].includes('currentImageSrc')))(
    '%s',
    (type) => {
      const state = configs.get(type)!.createInitialState({
        currentImageSrc: 'blob:edited',
      }) as Record<string, unknown>;
      expect(state.currentImageSrc).toBe('blob:edited');
    }
  );
});
