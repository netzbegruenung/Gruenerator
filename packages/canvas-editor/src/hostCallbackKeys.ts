import { BUILTIN_TEMPLATES, type CanvasConfigId } from './templates/registry';

/**
 * The state keys CanvasEditorRouter declares an `on<Key>Change` callback for,
 * per canvas type — derived from `BUILTIN_TEMPLATES[].hostCallbackKeys`, where
 * each template's list and its rationale live.
 */
export const HOST_CALLBACK_KEYS = Object.fromEntries(
  BUILTIN_TEMPLATES.map((t) => [t.id, t.hostCallbackKeys])
) as Record<CanvasConfigId, readonly string[]>;
