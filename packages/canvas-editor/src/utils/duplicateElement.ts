/**
 * Duplizieren von Canvas-Elementen — die eine Stelle.
 *
 * Vorher lag dieselbe Logik vierfach im Paket: im Strg+D-Zweig und im
 * Einfügen-Zweig von `useCanvasKeyboardHandlers`, und als `duplicateIllustration`
 * / `duplicateBalken` in `actionFactories`. Jede Fassung deckte eine andere
 * Teilmenge der Elementarten ab, und keine pflegte `layerOrder`.
 *
 * Drei Dinge, die hier zusammengehalten werden und einzeln leicht verloren gehen:
 *
 * 1. **`layerOrder`.** Eine ID, die dort nicht steht, hängt `buildSortedRenderList`
 *    ganz nach oben — und `moveLayer` gibt die Liste unverändert zurück, die
 *    Ebenen-Knöpfe sind für so eine Kopie also tot. Darum setzt `insertInstance`
 *    die neue ID direkt über das Original, wenn das Original geführt wird.
 * 2. **Tiefe Kopien.** `chart.data`, `balken.texts`, `circleBadge.textLines`,
 *    `shape.dash` und die Verlaufs-Stops sind Arrays. Ein flacher Spread teilt
 *    sie zwischen Original und Kopie: das Bearbeiten des einen ändert das andere.
 * 3. **Balken versetzt `offset`, nicht `x`/`y`.**
 *
 * Nicht jede Art liegt in einer Liste von Objekten: ein Icon steht als ID in
 * `selectedIcons` und mit seinem Zustand in `iconStates`. Darum besteht ein
 * Registry-Eintrag aus `find` und `insert` statt aus einem Feldnamen — `listSpec`
 * baut das Paar für die zehn Listen-Arten, das Icon bringt sein eigenes mit.
 *
 * Nicht duplizierbar bleiben Vorlagen-Elemente: sie stehen fest in der Vorlage,
 * nicht im Zustand. Sie kommen über `templateElementToEntry` herein, das aus der
 * aufgelösten Geometrie eine Instanz macht; `duplicateElementInState` allein
 * liefert für sie `null`.
 */

import { catalogIconId } from './iconInstances';

import type { BaseCanvasState, IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { CircleBadgeInstance } from '../primitives/CircleBadge';
import type { AssetInstance } from './canvasAssets';
import type { ChartInstance } from './chartUtils';
import type { FrameInstance } from './frameUtils';
import type { GradientFill } from './gradientFill';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';

/** Standardversatz einer Kopie gegenüber dem Original, in Canvas-Pixeln. */
export const DUPLICATE_OFFSET = 20;

export type DuplicableType =
  | 'shape'
  | 'additional-text'
  | 'balken'
  | 'illustration'
  | 'asset'
  | 'pill-badge'
  | 'circle-badge'
  | 'frame'
  | 'user-image'
  | 'chart'
  | 'icon';

/**
 * Die Nutzlast eines Icons: sein Zustand plus die Katalog-ID, aufgelöst. Anders
 * als in `IconState` ist `iconId` hier Pflicht — wer ein Icon einfügt, muss
 * sagen, welches.
 */
export interface IconInstanceData extends IconState {
  iconId: string;
}

/** Nutzlast je Art — spiegelt `ClipboardDataMap`, ergänzt um `chart` und `icon`. */
export interface DuplicableDataMap {
  shape: ShapeInstance;
  'additional-text': AdditionalText;
  balken: BalkenInstance;
  illustration: IllustrationInstance;
  asset: AssetInstance;
  'pill-badge': PillBadgeInstance;
  'circle-badge': CircleBadgeInstance;
  frame: FrameInstance;
  'user-image': UserImageInstance;
  chart: ChartInstance;
  icon: IconInstanceData;
}

/** Diskriminierte Union: `entry.type` verengt `entry.data` automatisch. */
export type DuplicableEntry = {
  [K in DuplicableType]: { type: K; data: DuplicableDataMap[K] };
}[DuplicableType];

/** Einheitliche Instanz-ID. Der Zufallsanteil ist nicht Zierde: im Kollaborations-
 *  betrieb erzeugen zwei Nutzer*innen in derselben Millisekunde sonst dieselbe ID. */
export function createInstanceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const cloneGradient = (g: GradientFill | null | undefined): GradientFill | null | undefined =>
  g ? { ...g, stops: g.stops.map((s) => ({ ...s })) } : g;

/** Liest ein Instanz-Array aus dem Zustand. Grenze zwischen Registry-Schlüssel
 *  (String) und getyptem Zustand — der Aufrufer kennt die Art über `DUPLICABLE`. */
function readList(state: object, field: string): { id: string }[] {
  const value = (state as Record<string, unknown>)[field];
  return Array.isArray(value) ? (value as { id: string }[]) : [];
}

interface DuplicableSpec<T> {
  /** Die Nutzlast dieser Art zu `id`, oder `null`, wenn die ID keine ist. */
  find: (state: object, id: string) => T | null;
  /** Der Teilzustand, den die Kopie ergänzt — er wird über den Zustand gelegt. */
  insert: (state: object, data: T, newId: string, offset: number) => Record<string, unknown>;
}

/** Der Normalfall: eine Art, die als Liste von `{ id, … }` im Zustand liegt. */
function listSpec<T extends { id: string }>(
  field: string,
  clone: (data: T, id: string, offset: number) => T
): DuplicableSpec<T> {
  return {
    find: (state, id) => (readList(state, field).find((i) => i.id === id) as T | undefined) ?? null,
    insert: (state, data, newId, offset) => ({
      [field]: [...readList(state, field), clone(data, newId, offset)],
    }),
  };
}

/**
 * Registry: je Art, wie man sie im Zustand findet und wie eine versetzte Kopie
 * hineinkommt. Eine neue Elementart wird genau hier eingetragen — der Rest
 * dieser Datei und alle vier Aufrufer ziehen automatisch nach.
 */
const DUPLICABLE: { [K in DuplicableType]: DuplicableSpec<DuplicableDataMap[K]> } = {
  shape: listSpec('shapeInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
    ...(d.dash ? { dash: [...d.dash] } : {}),
    ...(d.fillGradient !== undefined ? { fillGradient: cloneGradient(d.fillGradient) } : {}),
  })),
  'additional-text': listSpec('additionalTexts', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
    ...(d.fillGradient !== undefined ? { fillGradient: cloneGradient(d.fillGradient) } : {}),
  })),
  // Balken kennt kein x/y — seine Lage ist ein Versatz zur Layout-Basis.
  balken: listSpec('balkenInstances', (d, id, o) => ({
    ...d,
    id,
    offset: { x: (d.offset?.x ?? 0) + o, y: (d.offset?.y ?? 0) + o },
    texts: [...d.texts],
    ...(d.barOffsets ? { barOffsets: [...d.barOffsets] as [number, number, number] } : {}),
  })),
  illustration: listSpec('illustrationInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
  })),
  asset: listSpec('assetInstances', (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o })),
  'pill-badge': listSpec('pillBadgeInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
  })),
  'circle-badge': listSpec('circleBadgeInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
    textLines: d.textLines.map((l) => ({ ...l })),
  })),
  // `imageSrc` wird bewusst mitgenommen: ein Rahmen ohne sein Bild ist keine
  // Kopie. Dass das Löschen des Originals die geteilte Blob-URL freigibt,
  // verhindern die Zählungen in `removeFrame`/`removeUserImage`.
  frame: listSpec('frameInstances', (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o })),
  'user-image': listSpec('userImageInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
  })),
  chart: listSpec('chartInstances', (d, id, o) => ({
    ...d,
    id,
    x: d.x + o,
    y: d.y + o,
    data: d.data.map((p) => ({ ...p })),
    colors: [...d.colors],
  })),
  /**
   * Ein Icon liegt nicht in einer Liste: seine ID steht in `selectedIcons`,
   * sein Zustand unter derselben ID in `iconStates`. Ohne gespeicherten Zustand
   * gibt es nichts zu kopieren — Lage und Größe des Originals stünden dann erst
   * im Renderer fest (Mitte der Fläche), die Kopie käme also nicht versetzt
   * heraus. Solche Icons melden sich als nicht duplizierbar.
   */
  icon: {
    find: (state, id) => {
      const s = state as Partial<BaseCanvasState>;
      if (!s.selectedIcons?.includes(id)) return null;
      const base = s.iconStates?.[id];
      if (!base) return null;
      return { ...base, iconId: catalogIconId(id, s.iconStates) };
    },
    insert: (state, data, newId, offset) => {
      const s = state as Partial<BaseCanvasState>;
      return {
        selectedIcons: [...(s.selectedIcons ?? []), newId],
        iconStates: {
          ...s.iconStates,
          [newId]: { ...data, x: data.x + offset, y: data.y + offset },
        },
      };
    },
  },
};

export const DUPLICABLE_TYPES = Object.keys(DUPLICABLE) as DuplicableType[];

/**
 * Setzt `newId` direkt hinter `afterId` (= eine Ebene darüber, die Liste ist
 * von hinten nach vorn gezeichnet). Ist keine Reihenfolge gespeichert oder das
 * Original nicht geführt, bleibt die Liste unangetastet: unbekannte IDs zeichnet
 * `buildSortedRenderList` ohnehin obenauf, was für eine frische Kopie richtig ist.
 */
function withDuplicateInLayerOrder(
  order: string[] | undefined,
  afterId: string | null,
  newId: string
): string[] | null {
  if (!order || order.length === 0 || !afterId) return null;
  const index = order.indexOf(afterId);
  if (index === -1) return null;
  const next = [...order];
  next.splice(index + 1, 0, newId);
  return next;
}

export interface InsertResult<TState> {
  state: TState;
  newId: string;
}

/**
 * Fügt eine Instanz als neue Kopie in den Zustand ein. `afterId` ist die ID,
 * über der die Kopie in der Ebenenfolge landen soll — beim Duplizieren das
 * Original, beim Einfügen aus der Zwischenablage `null`.
 */
export function insertInstance<TState extends Partial<BaseCanvasState>>(
  state: TState,
  entry: DuplicableEntry,
  options: { afterId?: string | null; offset?: number } = {}
): InsertResult<TState> {
  const { afterId = null, offset = DUPLICATE_OFFSET } = options;
  const newId = createInstanceId(entry.type);

  // Eine Art pro Zweig: `entry.type` und `entry.data` bleiben korreliert, solange
  // sie nicht destrukturiert werden. Der Zugriff über den Registry-Schlüssel ist
  // die Grenze, an der der String-Schlüssel auf den getypten Zustand trifft.
  const spec = DUPLICABLE[entry.type] as DuplicableSpec<unknown>;
  const nextState = {
    ...state,
    ...spec.insert(state, entry.data, newId, offset),
  } as TState;

  const nextOrder = withDuplicateInLayerOrder(state.layerOrder, afterId, newId);
  if (nextOrder) nextState.layerOrder = nextOrder;

  return { state: nextState, newId };
}

/** Findet das Element mit dieser ID und benennt seine Art. `null` für alles,
 *  was nicht in einem Instanz-Array liegt (Vorlagen-Elemente, Icons). */
export function findDuplicableEntry<TState extends Partial<BaseCanvasState>>(
  state: TState,
  elementId: string
): DuplicableEntry | null {
  for (const type of DUPLICABLE_TYPES) {
    const found = (DUPLICABLE[type] as DuplicableSpec<unknown>).find(state, elementId);
    if (found) return { type, data: found } as DuplicableEntry;
  }
  return null;
}

/** Ist dieses Element duplizierbar? Speist den Aktiv-Zustand des Knopfes. */
export function canDuplicateElement<TState extends Partial<BaseCanvasState>>(
  state: TState,
  elementId: string | null
): boolean {
  return elementId !== null && findDuplicableEntry(state, elementId) !== null;
}

/**
 * Dupliziert das ausgewählte Element. Gibt `null` zurück, wenn die ID zu keiner
 * Instanz gehört — der Aufrufer lässt den Zustand dann unberührt und schreibt
 * insbesondere keinen Verlaufseintrag.
 */
export function duplicateElementInState<TState extends Partial<BaseCanvasState>>(
  state: TState,
  elementId: string,
  offset: number = DUPLICATE_OFFSET
): InsertResult<TState> | null {
  const entry = findDuplicableEntry(state, elementId);
  if (!entry) return null;
  return insertInstance(state, entry, { afterId: elementId, offset });
}
