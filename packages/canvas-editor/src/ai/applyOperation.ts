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
import { findElementRemover } from '../utils/removeElement';
import { isLockedShape, type ShapeInstance } from '../utils/shapes';

import type { TemplateAiCapabilities } from './types';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { CircleBadgeInstance } from '../primitives/CircleBadge';
import type { FrameInstance } from '../utils/frameUtils';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { CanvasAiOperation, CanvasAiUpdatePatch } from '@gruenerator/contracts';

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
 * Exported so callers (e.g. the chat section) can constrain their `TActions`
 * generic to extend this shape, eliminating the need for a cast at the call
 * site.
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
  removeChart?: (id: string) => void;
  toggleIcon?: (id: string, selected: boolean) => void;
  updateAdditionalText?: (id: string, partial: Partial<AdditionalText>) => void;
  // Font-size setters — factory-built templates expose primary/secondary;
  // bespoke templates expose template-specific names via applyOverrides.
  handlePrimaryFontSizeChange?: (size: number) => void;
  handleSecondaryFontSizeChange?: (size: number) => void;
  // Per-kind update actions used by the default `update-element` applier.
  // The applier picks the right one by walking the current state and
  // checking which collection the element id belongs to.
  updateIllustration?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateAsset?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateShape?: (id: string, partial: Partial<ShapeInstance>) => void;
  updatePillBadge?: (id: string, partial: Partial<PillBadgeInstance>) => void;
  updateCircleBadge?: (id: string, partial: Partial<CircleBadgeInstance>) => void;
  updateBalken?: (id: string, partial: Partial<BalkenInstance>) => void;
  updateFrame?: (id: string, partial: Partial<FrameInstance>) => void;
  updateUserImage?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateIcon?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  updateChart?: (id: string, partial: Partial<CanvasAiCleanPatch>) => void;
  // Added by GenericCanvas: every history save inside `fn` becomes one entry.
  runHistoryBatch?: (fn: () => void) => void;
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
        // Hier wird NICHT normalisiert: ob ein Feld Marker tragen darf, weiß
        // nur der Descriptor, und den hat dieser Applier nicht. Ein blindes
        // `- x` → `• x` machte aus „– Anna Müller" in einem Namensfeld einen
        // Aufzählungspunkt. Für den Chat-Pfad erledigt das `validateSharepicOp`
        // feldgenau; hier führt der Prompt die Form.
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
        // Same door as the Entf key: the collection the id lives in picks the
        // remover. Local cast as in dispatchUpdate — only optional fields are read.
        const state = getState() as Partial<BaseCanvasState>;
        const shape = state.shapeInstances?.find((el) => el.id === op.elementId);
        if (shape && isLockedShape(shape)) {
          return { ok: false, reason: `shape "${op.elementId}" is a locked background plane` };
        }
        const remove = findElementRemover(state, actions, op.elementId);
        if (!remove) return { ok: false, reason: `element "${op.elementId}" not found` };
        remove();
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

      case 'set-background-image':
        // Server-only operation: the chat backend resolves the stock-photo
        // query via ImageSelectionService before patching state. The studio
        // applier has no resolver — users change images via the Hintergrund tab.
        return {
          ok: false,
          reason: 'Hintergrundbilder bitte über den Hintergrund-Tab ändern',
        };

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

type Patch = Partial<CanvasAiCleanPatch>;
type PatchKey = keyof CanvasAiCleanPatch;

/** Null when every set field is one the kind can take, else the reason. */
function rejectFields(patch: Patch, allowed: readonly PatchKey[], label: string): string | null {
  const bad = (Object.keys(patch) as PatchKey[]).filter((k) => !allowed.includes(k));
  return bad.length > 0 ? `${label} has no ${bad.join('/')}` : null;
}

function withScaleXY(patch: Patch, el: { scaleX: number; scaleY: number }) {
  const { scale, ...rest } = patch;
  return {
    ...rest,
    ...(scale != null && { scaleX: el.scaleX * scale, scaleY: el.scaleY * scale }),
  };
}

const GEOMETRY: readonly PatchKey[] = ['x', 'y', 'rotation', 'opacity', 'scale'];

/**
 * Each kind names its colour and size differently (`fill`, `backgroundColor`,
 * `scaleX/Y`, `fontSize`); the patch is translated per kind, and a field the
 * kind cannot take fails the op instead of landing as a stray key that
 * changes nothing on screen.
 */
function dispatchUpdate<TState>(
  elementId: string,
  patch: Patch,
  actions: CanvasAiActionsBase,
  getState: () => TState
): ApplyResult {
  // Local cast: only BaseCanvasState's optional collections are read.
  const state = getState() as Partial<BaseCanvasState>;
  const find = <T extends { id: string }>(list: readonly T[] | undefined) =>
    list?.find((el) => el.id === elementId);

  function run<P>(
    label: string,
    updater: ((id: string, partial: P) => void) | undefined,
    allowed: readonly PatchKey[],
    build: () => P
  ): ApplyResult {
    if (!updater) return { ok: false, reason: `template does not support updating ${label}` };
    const reason = rejectFields(patch, allowed, label);
    if (reason) return { ok: false, reason };
    updater(elementId, build());
    return { ok: true };
  }

  const text = find(state.additionalTexts);
  if (text) {
    // `scale` resizes the font so the sidebar's size control keeps showing the truth.
    return run('text', actions.updateAdditionalText, [...GEOMETRY, 'color'], () => {
      const { color, scale, ...rest } = patch;
      return {
        ...rest,
        ...(color != null && { fill: color }),
        ...(scale != null && { fontSize: Math.round(text.fontSize * scale) }),
      };
    });
  }

  const shape = find(state.shapeInstances);
  if (shape) {
    if (isLockedShape(shape)) {
      return { ok: false, reason: `shape "${elementId}" is a locked background plane` };
    }
    return run('shape', actions.updateShape, [...GEOMETRY, 'color'], () => {
      const { color, ...rest } = withScaleXY(patch, shape);
      return { ...rest, ...(color != null && { fill: color }) };
    });
  }

  const frame = find(state.frameInstances);
  if (frame) return run('frame', actions.updateFrame, GEOMETRY, () => withScaleXY(patch, frame));

  const badgeColor = () => {
    const { color, ...rest } = patch;
    return { ...rest, ...(color != null && { backgroundColor: color }) };
  };
  if (find(state.pillBadgeInstances)) {
    return run('pill-badge', actions.updatePillBadge, [...GEOMETRY, 'color'], badgeColor);
  }
  if (find(state.circleBadgeInstances)) {
    return run('circle-badge', actions.updateCircleBadge, [...GEOMETRY, 'color'], badgeColor);
  }

  const balken = find(state.balkenInstances);
  if (balken) {
    return run('balken', actions.updateBalken, GEOMETRY, () => {
      const { x, y, ...rest } = patch;
      return x == null && y == null
        ? rest
        : { ...rest, offset: { x: x ?? balken.offset.x, y: y ?? balken.offset.y } };
    });
  }

  if (find(state.illustrationInstances)) {
    return run('illustration', actions.updateIllustration, [...GEOMETRY, 'color'], () => patch);
  }
  if (find(state.assetInstances)) return run('asset', actions.updateAsset, GEOMETRY, () => patch);
  if (find(state.userImageInstances)) {
    return run('user-image', actions.updateUserImage, GEOMETRY, () => patch);
  }
  if (find(state.chartInstances)) return run('chart', actions.updateChart, GEOMETRY, () => patch);

  if (state.iconStates && elementId in state.iconStates) {
    return run('icon', actions.updateIcon, [...GEOMETRY, 'color'], () => patch);
  }

  return { ok: false, reason: `element "${elementId}" not found in any collection` };
}
