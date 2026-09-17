/**
 * Dual-write wrapper for template-field callbacks.
 *
 * Template-field edits flow `on<Key>Change` → host (CanvasEditorRouter).
 * A mounted page renders from `pages[i].state`, which historically was only
 * written at seed time — so text edits never reached other clients live
 * (collab) or page duplication (local), and a reload mounted the stale seed.
 * Wrapping each callback to ALSO write the page's state map keeps
 * `pages[i].state` current everywhere.
 *
 * The returned object is identity-stable, and each entry resolves the host
 * callback and page-state writer at CALL time through the getters — hosts
 * rebuild their callbacks object every render, and memoizing on it would
 * re-render every PageWrapper per keystroke (the returned object is each
 * page's `callbacks` prop).
 *
 * Callback names follow the `on<Key>Change` convention (see
 * CanvasEditorRouter.createCallbacks); anything else passes through untouched.
 *
 * `alsoPersistKeys` covers the other half of a page: the free-element
 * collections (PAGE_ELEMENT_STATE_KEYS). No host declares a callback for
 * those — the config's own actions mutate them through `setState` — so the
 * wrapper mints the missing `on<Key>Change` itself, writing page state only.
 * That is what `useEmitHostStateChanges` calls from the mounted page. Without
 * it a key with no host entry has no writer at all, which is exactly how free
 * elements went missing on reload (#3416).
 */
const CALLBACK_NAME = /^on([A-Z].*)Change$/;

const callbackName = (stateKey: string): string =>
  `on${stateKey.charAt(0).toUpperCase()}${stateKey.slice(1)}Change`;

export function createPageSyncedCallbacks(
  getCallbacks: () => Record<string, (val: unknown) => void>,
  writePageState: (partial: Record<string, unknown>) => void,
  alsoPersistKeys: readonly string[] = []
): Record<string, (val: unknown) => void> {
  const wrapped: Record<string, (val: unknown) => void> = {};
  for (const name of Object.keys(getCallbacks())) {
    const match = CALLBACK_NAME.exec(name);
    if (!match) {
      wrapped[name] = (val: unknown) => {
        getCallbacks()[name]?.(val);
      };
      continue;
    }
    const stateKey = match[1].charAt(0).toLowerCase() + match[1].slice(1);
    wrapped[name] = (val: unknown) => {
      getCallbacks()[name]?.(val);
      writePageState({ [stateKey]: val });
    };
  }
  for (const stateKey of alsoPersistKeys) {
    const name = callbackName(stateKey);
    // A host that DOES declare this one is already dual-written above; minting
    // a second entry would drop its callback.
    if (wrapped[name]) continue;
    wrapped[name] = (val: unknown) => {
      writePageState({ [stateKey]: val });
    };
  }
  return wrapped;
}
