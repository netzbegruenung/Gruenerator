/**
 * Applies a CanvasAiOperation to the active template's actions.
 *
 * Design:
 *   - One exhaustive switch over op.kind. TypeScript's `never` check at the
 *     end forces every kind in the discriminated union to be handled —
 *     adding a new kind to the Zod schema breaks compilation here until
 *     it's mapped.
 *   - Per-template `applyOverrides` take priority over the default path.
 *     Use them when the conventional action name doesn't apply (e.g.
 *     dreizeilen's `setLine1/2/3`, presentation's `setColorMode`).
 *   - Each op is wrapped in try/catch so one bad op in a multi-op
 *     suggestion doesn't abort the rest.
 */
import type { CanvasAiOperation, CanvasAiUpdatePatch } from '@gruenerator/contracts';

import type { TemplateAiCapabilities } from './types';

export type ApplyResult = { ok: true } | { ok: false; reason: string };

/**
 * Strict patch passed to per-kind update actions.
 *
 * Drops `null`/`undefined` fields from CanvasAiUpdatePatch — appliers only
 * see set fields. Each template's actual `update*` action accepts a wider
 * `Partial<TInstance>`; this narrower shape is structurally compatible
 * with all of them while preserving exact field-level type-safety.
 */
export type CanvasAiCleanPatch = {
  [K in keyof CanvasAiUpdatePatch]: NonNullable<CanvasAiUpdatePatch[K]>;
};

/**
 * The set of (all-optional) action methods the default applier path knows
 * how to call. Every template's actions object structurally satisfies this
 * because each method is optional — no template is forced to implement
 * actions it doesn't support.
 *
 * Exported so `AiSection` can constrain its `TActions` generic to extend
 * this shape, eliminating the need for a cast at the call site.
 */
export interface CanvasAiActionsBase {
  // Common text setters — most templates expose at least one of these
  setPrimary?: (v: string) => void;
  setSecondary?: (v: string) => void;
  setHeadline?: (v: string) => void;
  setSubtext?: (v: string) => void;
  setBackgroundColor?: (color: string) => void;
  addIllustration?: (id: string) => void;
  addAsset?: (id: string) => void;
  addBodyTextWithContent?: (content: string) => void;
  removeIllustration?: (id: string) => void;
  removeAsset?: (id: string) => void;
  removeShape?: (id: string) => void;
  removePillBadge?: (id: string) => void;
  removeCircleBadge?: (id: string) => void;
  removeBalken?: (id: string) => void;
  removeFrame?: (id: string) => void;
  removeUserImage?: (id: string) => void;
  removeAdditionalText?: (id: string) => void;
  updateAdditionalText?: (id: string, partial: { text: string }) => void;
  // Font-size setters — factory-built templates expose primary/secondary;
  // bespoke templates expose template-specific names via applyOverrides.
  handlePrimaryFontSizeChange?: (size: number) => void;
  handleSecondaryFontSizeChange?: (size: number) => void;
  // Per-kind update actions used by the default `update-element` applier.
  // The applier picks the right one by walking the current state and
  // checking which collection the element id belongs to.
  updateIllustration?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateAsset?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateShape?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updatePillBadge?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateCircleBadge?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateBalken?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateFrame?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateUserImage?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateIcon?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
}

function pickTextSetter(
  field: string,
  actions: CanvasAiActionsBase
): ((v: string) => void) | undefined {
  // Conventional field name → action name mappings used across templates.
  // Per-template overrides are preferred for non-conventional names.
  switch (field) {
    case 'primary':
    case 'headline':
    case 'quote':
    case 'header':
    case 'eventTitle':
    case 'title':
      return actions.setPrimary ?? actions.setHeadline;
    case 'secondary':
    case 'subtext':
    case 'name':
    case 'body':
    case 'beschreibung':
    case 'subtitle':
      return actions.setSecondary ?? actions.setSubtext;
    case 'new-body':
      return (v) => actions.addBodyTextWithContent?.(v);
    default:
      return undefined;
  }
}

function pickFontSizeSetter(
  field: string,
  actions: CanvasAiActionsBase
): ((size: number) => void) | undefined {
  // Most templates expose `handlePrimaryFontSizeChange` /
  // `handleSecondaryFontSizeChange` from the factory. We map any known
  // primary-text alias to primary, any secondary-text alias to secondary.
  switch (field) {
    case 'primary':
    case 'headline':
    case 'quote':
    case 'header':
    case 'eventTitle':
    case 'title':
      return actions.handlePrimaryFontSizeChange;
    case 'secondary':
    case 'subtext':
    case 'name':
    case 'body':
    case 'beschreibung':
    case 'subtitle':
      return actions.handleSecondaryFontSizeChange;
    default:
      return undefined;
  }
}

export function applyOperation<TState, TActions extends CanvasAiActionsBase>(
  op: CanvasAiOperation,
  actions: TActions,
  getState: () => TState,
  capabilities: TemplateAiCapabilities<TState, TActions>
): ApplyResult {
  // Per-template override wins
  const override = capabilities.applyOverrides?.[op.kind];
  if (override) {
    try {
      // Cast safe: override key matches op.kind, so the discriminated union
      // narrows to the same variant the override was typed against.
      (override as (op: CanvasAiOperation, a: TActions, gs: () => TState) => void)(
        op,
        actions,
        getState
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: errorReason(e) };
    }
  }

  try {
    switch (op.kind) {
      case 'set-text': {
        // 1) Try existing additionalText id
        const state = getState() as { additionalTexts?: Array<{ id: string }> };
        const existing = state.additionalTexts?.find((t) => t.id === op.field);
        if (existing) {
          actions.updateAdditionalText?.(op.field, { text: op.value });
          return { ok: true };
        }
        // 2) Try conventional setter
        const setter = pickTextSetter(op.field, actions);
        if (setter) {
          setter(op.value);
          return { ok: true };
        }
        return {
          ok: false,
          reason: `no setter for text field "${op.field}" in this template`,
        };
      }

      case 'set-color-scheme':
        return {
          ok: false,
          reason: 'set-color-scheme requires a template applyOverride',
        };

      case 'set-background-color': {
        if (!actions.setBackgroundColor) {
          return { ok: false, reason: 'template does not support background color' };
        }
        actions.setBackgroundColor(op.color);
        return { ok: true };
      }

      case 'set-color-mode':
        return {
          ok: false,
          reason: 'set-color-mode requires a template applyOverride',
        };

      case 'add-illustration': {
        if (!actions.addIllustration) {
          return { ok: false, reason: 'template does not support illustrations' };
        }
        actions.addIllustration(op.illustrationId);
        return { ok: true };
      }

      case 'add-asset': {
        if (!actions.addAsset) {
          return { ok: false, reason: 'template does not support assets' };
        }
        actions.addAsset(op.assetId);
        return { ok: true };
      }

      case 'remove-element': {
        // Try each remove action — first match wins. Backend snapshot tells
        // the AI element kinds; we trust the id is unique across kinds.
        const removers: Array<((id: string) => void) | undefined> = [
          actions.removeIllustration,
          actions.removeAsset,
          actions.removeShape,
          actions.removePillBadge,
          actions.removeCircleBadge,
          actions.removeBalken,
          actions.removeFrame,
          actions.removeUserImage,
          actions.removeAdditionalText,
        ];
        for (const r of removers) {
          if (r) {
            try {
              r(op.elementId);
            } catch {
              // try the next remover
            }
          }
        }
        return { ok: true };
      }

      case 'toggle-sunflower':
        return {
          ok: false,
          reason: 'toggle-sunflower requires a template applyOverride',
        };

      case 'set-font-size': {
        // Default: map conventional primary/secondary aliases to the standard
        // factory actions. Bespoke templates with custom action names should
        // register an applyOverride.
        const setter = pickFontSizeSetter(op.field, actions);
        if (!setter) {
          return {
            ok: false,
            reason: `no font-size setter for field "${op.field}" in this template`,
          };
        }
        setter(op.size);
        return { ok: true };
      }

      case 'update-element': {
        const cleanPatch = stripNullPatchFields(op.patch);
        const dispatchResult = dispatchUpdate(op.elementId, cleanPatch, actions, getState);
        return dispatchResult;
      }

      default: {
        // Exhaustiveness check — if a new op kind is added to the Zod
        // schema, this line fails to compile until it is handled above.
        const _exhaustive: never = op;
        void _exhaustive;
        return { ok: false, reason: 'unknown operation kind' };
      }
    }
  } catch (e) {
    return { ok: false, reason: errorReason(e) };
  }
}

function errorReason(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'unknown error';
}

/**
 * Build a strict patch object containing only the fields the AI actually set,
 * dropping null/undefined. Each field is narrowed via NonNullable so the
 * resulting object's value types are exact (no nullability).
 */
function stripNullPatchFields(p: CanvasAiUpdatePatch): Partial<CanvasAiCleanPatch> {
  const out: Partial<CanvasAiCleanPatch> = {};
  if (p.color != null) out.color = p.color;
  if (p.opacity != null) out.opacity = p.opacity;
  if (p.scale != null) out.scale = p.scale;
  if (p.rotation != null) out.rotation = p.rotation;
  if (p.x != null) out.x = p.x;
  if (p.y != null) out.y = p.y;
  return out;
}

/**
 * Shape of state collections that update-element can target. Each template
 * declares some subset of these fields; missing ones are silently skipped
 * during dispatch.
 */
interface UpdateableState {
  illustrationInstances?: ReadonlyArray<{ id: string }>;
  assetInstances?: ReadonlyArray<{ id: string }>;
  shapeInstances?: ReadonlyArray<{ id: string }>;
  pillBadgeInstances?: ReadonlyArray<{ id: string }>;
  circleBadgeInstances?: ReadonlyArray<{ id: string }>;
  balkenInstances?: ReadonlyArray<{ id: string }>;
  frameInstances?: ReadonlyArray<{ id: string }>;
  userImageInstances?: ReadonlyArray<{ id: string }>;
  iconStates?: Readonly<Record<string, unknown>>;
}

function dispatchUpdate<TState>(
  elementId: string,
  patch: Partial<CanvasAiCleanPatch>,
  actions: CanvasAiActionsBase,
  getState: () => TState
): ApplyResult {
  // Narrow state to the shape we care about. The cast here is local and
  // structurally safe — we only access optional fields that are part of
  // BaseCanvasState's documented surface.
  const state = getState() as TState & UpdateableState;

  type Collection = {
    list: ReadonlyArray<{ id: string }> | undefined;
    updater: ((id: string, partial: Partial<CanvasAiCleanPatch>) => void) | undefined;
    label: string;
  };

  const collections: Collection[] = [
    {
      list: state.illustrationInstances,
      updater: actions.updateIllustration,
      label: 'illustration',
    },
    { list: state.assetInstances, updater: actions.updateAsset, label: 'asset' },
    { list: state.shapeInstances, updater: actions.updateShape, label: 'shape' },
    { list: state.pillBadgeInstances, updater: actions.updatePillBadge, label: 'pill-badge' },
    { list: state.circleBadgeInstances, updater: actions.updateCircleBadge, label: 'circle-badge' },
    { list: state.balkenInstances, updater: actions.updateBalken, label: 'balken' },
    { list: state.frameInstances, updater: actions.updateFrame, label: 'frame' },
    { list: state.userImageInstances, updater: actions.updateUserImage, label: 'user-image' },
  ];

  for (const { list, updater, label } of collections) {
    if (!list?.some((el) => el.id === elementId)) continue;
    if (!updater) return { ok: false, reason: `template does not support updating ${label}` };
    updater(elementId, patch);
    return { ok: true };
  }

  if (state.iconStates && elementId in state.iconStates && actions.updateIcon) {
    actions.updateIcon(elementId, patch);
    return { ok: true };
  }

  return { ok: false, reason: `element "${elementId}" not found in any collection` };
}
