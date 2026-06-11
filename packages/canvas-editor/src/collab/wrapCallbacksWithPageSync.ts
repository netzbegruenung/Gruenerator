/**
 * Dual-write wrapper for template-field callbacks in collaborative mode.
 *
 * Template-field edits flow `on<Key>Change` → host (CanvasEditorRouter) →
 * root `formState` Y.Map. But a mounted collab page renders from
 * `pages[i].state`, which historically was only written at seed time — so
 * studio→studio text edits never reached other clients live, and a reload
 * mounted the stale seed. Wrapping each callback to ALSO write the page's
 * state map keeps `pages[i].state` current: remote clients pick the change
 * up via useYjsPageStateSync, and reloads mount the edited values.
 *
 * Callback names follow the `on<Key>Change` convention (see
 * CanvasEditorRouter.createCallbacks); anything else passes through untouched.
 */
const CALLBACK_NAME = /^on([A-Z].*)Change$/;

export function wrapCallbacksWithPageSync(
  callbacks: Record<string, (val: unknown) => void>,
  writePageState: (partial: Record<string, unknown>) => void
): Record<string, (val: unknown) => void> {
  const wrapped: Record<string, (val: unknown) => void> = {};
  for (const [name, fn] of Object.entries(callbacks)) {
    const match = CALLBACK_NAME.exec(name);
    if (!match) {
      wrapped[name] = fn;
      continue;
    }
    const stateKey = match[1].charAt(0).toLowerCase() + match[1].slice(1);
    wrapped[name] = (val: unknown) => {
      fn(val);
      writePageState({ [stateKey]: val });
    };
  }
  return wrapped;
}
