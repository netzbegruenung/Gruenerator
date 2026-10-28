// SPDX-License-Identifier: MPL-2.0
import type {
  CanvasItem,
  HostElementData,
  HostElementKindName,
  HostElementPayload,
  HostElementStateKey,
} from './canvasItem.js';
import type { InsertOffset } from './duplicateElement.js';
import type { OrientationPatch } from './orientElement.js';
import type { CanvasAiCleanPatch } from '../ai/applyOperation.js';
import type { PptxBox, PptxItem } from '../export/pptx/types.js';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState.js';

/** The element kinds a canvas holds beside the config's own elements, the host's included. */
export type ElementKindName = Exclude<CanvasItem['type'], 'element'>;
type KindName = ElementKindName;

/** One placed instance of a kind, as the render list carries it. */
export type KindItem = Exclude<CanvasItem, { type: 'element' }>;

export interface ElementKindDef {
  kind: KindName;
  /** Where the kind lives in the canvas state; F0, stored in canvases and templates. */
  stateKey: string;
  /**
   * The action that deletes one by id. `null` for icons: their ids are listed
   * in `selectedIcons`, and deleting one switches it off (`toggleIcon`).
   */
  remove: Extract<keyof OptionalCanvasActions, `remove${string}`> | null;
}

/**
 * The core's element kinds, in the order they stack after the config's own
 * elements and the host's kinds (`registerElementKind`). A new kind is added here: `buildCanvasItems`,
 * `findElementRemover` and `findKindItem` follow, the per-kind tables
 * (`KIND_RENDERERS`, the floating modules, the orientation doors, the
 * duplicate specs) fail to compile until they name it, and a test holds
 * `CARRIED_INSTANCE_KEYS` to it, so a re-seed cannot drop the kind's state.
 */
export const ELEMENT_KINDS = [
  { kind: 'icon', stateKey: 'selectedIcons', remove: null },
  { kind: 'shape', stateKey: 'shapeInstances', remove: 'removeShape' },
  { kind: 'frame', stateKey: 'frameInstances', remove: 'removeFrame' },
  { kind: 'additional-text', stateKey: 'additionalTexts', remove: 'removeAdditionalText' },
  { kind: 'illustration', stateKey: 'illustrationInstances', remove: 'removeIllustration' },
  { kind: 'asset', stateKey: 'assetInstances', remove: 'removeAsset' },
  { kind: 'circle-badge', stateKey: 'circleBadgeInstances', remove: 'removeCircleBadge' },
  { kind: 'pill-badge', stateKey: 'pillBadgeInstances', remove: 'removePillBadge' },
  { kind: 'user-image', stateKey: 'userImageInstances', remove: 'removeUserImage' },
  { kind: 'chart', stateKey: 'chartInstances', remove: 'removeChart' },
] as const satisfies readonly ElementKindDef[];

/** The core's own kinds: every per-kind table of the core is keyed by these. */
export type CoreElementKindName = (typeof ELEMENT_KINDS)[number]['kind'];

const CORE_KINDS: ReadonlySet<string> = new Set(ELEMENT_KINDS.map((k) => k.kind));

/** Is `kind` one of the core's own kinds? */
export function isCoreElementKind(kind: string): kind is CoreElementKindName {
  return CORE_KINDS.has(kind);
}

// ============================================================================
// HOST KINDS
// ============================================================================

/** A host kind's patch to its own instance, written through its update action. */
type KindPatch = Record<string, unknown>;

/**
 * What the editor does with one host element kind — its one registration.
 * The kind's type side (`stateKey`, `data`, `payload`) is the host's entry in
 * `HostElementKinds` (`canvasItem.ts`); its renderer comes through
 * `registerKindRenderers`, because drawing pulls Konva and this registration
 * must not.
 *
 * A host kind lives as a list of `{ id, … }` under `stateKey`. It stacks
 * after the config's own elements and before the core's kinds, in the order
 * the host registered it. Every hook is optional except the ones that make a
 * kind a kind; a missing hook means the editor does not offer that (no copy,
 * no rotation, no arrow-key move, no toolbar, no AI line, no PPTX item).
 * Methods, not function properties: one registry holds every host kind.
 */
export interface ElementKindRegistration<K extends HostElementKindName = HostElementKindName> {
  kind: K;
  /** Where the list lives in the canvas state; stored in canvases and templates. */
  stateKey: HostElementStateKey<K>;
  /**
   * The config's actions the kind changes through, by name: `update(id, patch)`
   * and `remove(id)`. A config without them cannot change the kind.
   */
  actions: { update: string; remove: string };
  /**
   * The config's action an Elemente tile or a drop adds the kind with, and its
   * arguments for the tile's `payload`; the drop appends its placement.
   */
  add?: {
    action: string;
    args(payload: HostElementPayload<K>): readonly unknown[];
  };
  /** The kind's name in the layer list and the selection label. */
  name(): string;
  /** The content its layer-list name shows after the kind name (`Text: …`). */
  layerContent?(data: HostElementData<K>): string;
  /** A copy with `id`, moved by `offset` (Duplizieren, Einfügen). */
  duplicate?(data: HostElementData<K>, id: string, offset: InsertOffset): HostElementData<K>;
  /** The update patch for a rotation (around its centre) or a move by `translate`. */
  orient?(patch: OrientationPatch, data: HostElementData<K>): KindPatch;
  /** The update patch for an arrow-key move by `delta`. */
  nudge?(data: HostElementData<K>, delta: { x: number; y: number }): KindPatch;
  /**
   * The floating toolbar's values; its module is named after the kind. Only
   * the opacity control writes back, through `actions.update`.
   */
  floating?(data: HostElementData<K>): Omit<FloatingModuleState['data'], 'id'>;
  /** „Text bearbeiten“ (F2) opens the kind's own text editor (`textEditorOpeners`). */
  editableText?: true;
  /** The kind's line in the AI's element list, before the layer position. */
  describe?(data: HostElementData<K>): string;
  /** Which AI `update-element` fields the kind takes, and its update patch for them. */
  aiUpdate?: {
    fields: readonly (keyof CanvasAiCleanPatch)[];
    patch(patch: Partial<CanvasAiCleanPatch>, data: HostElementData<K>): KindPatch;
  };
  /** The kind on a PPTX slide; without it the list counts as an unknown key. */
  pptx?(data: HostElementData<K>, page: PptxBox): PptxItem | PptxItem[];
  /** Page-state keys the kind's templates keep beside the list; the page persists them. */
  pageStateKeys?: readonly string[];
  /** Page-state keys the layout of the kind's templates reads; a change recomputes it. */
  layoutStateKeys?: readonly string[];
}

const hostKinds = new Map<string, ElementKindRegistration>();
let hostKindsVersion = 0;

/**
 * Registers a host element kind, once at startup before the first render,
 * next to the asset catalogue. Registering the same kind again replaces it.
 */
export function registerElementKind<K extends HostElementKindName>(
  registration: ElementKindRegistration<K>
): void {
  if (isCoreElementKind(registration.kind)) {
    throw new Error(`"${registration.kind}" is a core element kind`);
  }
  hostKinds.set(registration.kind, registration as unknown as ElementKindRegistration);
  hostKindsVersion += 1;
}

/** The host kinds, in the order they were registered. */
export function hostElementKinds(): readonly ElementKindRegistration[] {
  return [...hostKinds.values()];
}

/** The host kind named `kind`, or `null` (a core kind or none at all). */
export function hostElementKind(kind: string): ElementKindRegistration | null {
  return hostKinds.get(kind) ?? null;
}

/**
 * A value derived from the host kinds, recomputed only after a registration:
 * the key lists hand out the same array until then (hook dependencies).
 */
export function fromHostKinds<T>(
  derive: (kinds: readonly ElementKindRegistration[]) => T
): () => T {
  let version = -1;
  let value: T;
  return () => {
    if (version !== hostKindsVersion) {
      value = derive(hostElementKinds());
      version = hostKindsVersion;
    }
    return value;
  };
}

/** A host instance of `id` with its registration, or `null`. */
export function findHostInstance(
  state: object,
  id: string
): { kind: ElementKindRegistration; data: { id: string } } | null {
  for (const kind of hostKinds.values()) {
    const data = kindList(state, kind.stateKey).find(
      (e) => (e as { id?: unknown } | null)?.id === id
    );
    if (data !== undefined) return { kind, data: data as { id: string } };
  }
  return null;
}

/** The config's action `name`, if it has one. */
export function kindAction(
  actions: object | null | undefined,
  name: string
): ((...args: never[]) => unknown) | null {
  const action = (actions as Record<string, unknown> | null | undefined)?.[name];
  return typeof action === 'function' ? (action as (...args: never[]) => unknown) : null;
}

/** Writes `patch` through the kind's update action; `false` without one. */
export function updateHostInstance(
  actions: object,
  kind: ElementKindRegistration,
  id: string,
  patch: KindPatch
): boolean {
  const update = kindAction(actions, kind.actions.update) as
    ((id: string, patch: KindPatch) => void) | null;
  if (!update) return false;
  update(id, patch);
  return true;
}

/** A tile or drop of a host kind: its `kind` and its payload. */
export type HostElementAction = {
  [K in HostElementKindName]: { kind: K } & HostElementPayload<K>;
}[HostElementKindName];

/** Can this config add a host kind (state list and add action present)? */
export function canAddHostElement(
  kind: string,
  state: object | null | undefined,
  actions: object | null | undefined
): boolean {
  const registration = hostElementKind(kind);
  return (
    !!registration?.add &&
    !!state &&
    registration.stateKey in state &&
    kindAction(actions, registration.add.action) !== null
  );
}

/** Adds a host kind for a tile or drop; `false` when the config cannot. */
export function addHostElement(
  payload: { kind: string },
  actions: object | null | undefined,
  placement?: object
): boolean {
  const add = hostElementKind(payload.kind)?.add;
  const run = add ? kindAction(actions, add.action) : null;
  if (!add || !run) return false;
  // Boundary: the registration's own payload, keyed by the same `kind`.
  const args = add.args(payload as never);
  (run as (...args: unknown[]) => void)(...args, ...(placement ? [placement] : []));
  return true;
}

/** A kind's list in a state, or nothing when the state has none. */
export function kindList(state: object, stateKey: string): readonly unknown[] {
  const value = (state as Record<string, unknown>)[stateKey];
  return Array.isArray(value) ? value : [];
}

/**
 * A list entry of a kind as a render-list item. Icons are the exception: their
 * list holds bare ids, and their state lives apart in `iconStates`.
 */
export function kindItem(kind: KindName, entry: unknown): KindItem {
  // Boundary: the kind tells the payload type the registry cannot spell.
  return kind === 'icon'
    ? { id: entry as string, type: 'icon' }
    : ({ id: (entry as { id: string }).id, type: kind, data: entry } as KindItem);
}

/** Which kind `id` is and its instance — host kinds first, then `ELEMENT_KINDS`; `null` if none. */
export function findKindItem(state: object, id: string): KindItem | null {
  const host = findHostInstance(state, id);
  if (host) return kindItem(host.kind.kind, host.data);
  for (const { kind, stateKey } of ELEMENT_KINDS) {
    const entry = kindList(state, stateKey).find((e) =>
      kind === 'icon' ? e === id : (e as { id?: unknown } | null)?.id === id
    );
    if (entry !== undefined) return kindItem(kind, entry);
  }
  return null;
}
