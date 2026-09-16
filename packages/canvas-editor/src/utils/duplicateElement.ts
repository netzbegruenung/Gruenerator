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
 * Nicht duplizierbar und bewusst nicht hier: Vorlagen-Elemente (stehen fest in
 * der Vorlage, nicht in einer Liste) und Icons (ihre ID ist die Katalog-ID, siehe
 * `CanvasRenderLayer`). Für beide liefert `duplicateElementInState` `null`.
 */

import type { BaseCanvasState } from '../configs/factory/baseTypes';
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
  | 'chart';

/** Nutzlast je Art — spiegelt `ClipboardDataMap`, ergänzt um `chart`. */
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

/**
 * Registry: je Art das Zustandsfeld, das sie hält, und wie eine versetzte
 * Kopie entsteht. Eine neue Elementart wird genau hier eingetragen — der
 * Rest dieser Datei und alle vier Aufrufer ziehen automatisch nach.
 */
const DUPLICABLE: {
  [K in DuplicableType]: {
    field: string;
    clone: (data: DuplicableDataMap[K], id: string, offset: number) => DuplicableDataMap[K];
  };
} = {
  shape: {
    field: 'shapeInstances',
    clone: (d, id, o) => ({
      ...d,
      id,
      x: d.x + o,
      y: d.y + o,
      ...(d.dash ? { dash: [...d.dash] } : {}),
      ...(d.fillGradient !== undefined ? { fillGradient: cloneGradient(d.fillGradient) } : {}),
    }),
  },
  'additional-text': {
    field: 'additionalTexts',
    clone: (d, id, o) => ({
      ...d,
      id,
      x: d.x + o,
      y: d.y + o,
      ...(d.fillGradient !== undefined ? { fillGradient: cloneGradient(d.fillGradient) } : {}),
    }),
  },
  balken: {
    field: 'balkenInstances',
    // Balken kennt kein x/y — seine Lage ist ein Versatz zur Layout-Basis.
    clone: (d, id, o) => ({
      ...d,
      id,
      offset: { x: (d.offset?.x ?? 0) + o, y: (d.offset?.y ?? 0) + o },
      texts: [...d.texts],
      ...(d.barOffsets ? { barOffsets: [...d.barOffsets] as [number, number, number] } : {}),
    }),
  },
  illustration: {
    field: 'illustrationInstances',
    clone: (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o }),
  },
  asset: {
    field: 'assetInstances',
    clone: (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o }),
  },
  'pill-badge': {
    field: 'pillBadgeInstances',
    clone: (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o }),
  },
  'circle-badge': {
    field: 'circleBadgeInstances',
    clone: (d, id, o) => ({
      ...d,
      id,
      x: d.x + o,
      y: d.y + o,
      textLines: d.textLines.map((l) => ({ ...l })),
    }),
  },
  frame: {
    // `imageSrc` wird bewusst mitgenommen: ein Rahmen ohne sein Bild ist keine
    // Kopie. Dass das Löschen des Originals die geteilte Blob-URL freigibt,
    // verhindern die Zählungen in `removeFrame`/`removeUserImage`.
    field: 'frameInstances',
    clone: (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o }),
  },
  'user-image': {
    field: 'userImageInstances',
    clone: (d, id, o) => ({ ...d, id, x: d.x + o, y: d.y + o }),
  },
  chart: {
    field: 'chartInstances',
    clone: (d, id, o) => ({
      ...d,
      id,
      x: d.x + o,
      y: d.y + o,
      data: d.data.map((p) => ({ ...p })),
      colors: [...d.colors],
    }),
  },
};

export const DUPLICABLE_TYPES = Object.keys(DUPLICABLE) as DuplicableType[];

/** Liest ein Instanz-Array aus dem Zustand. Grenze zwischen Registry-Schlüssel
 *  (String) und getyptem Zustand — der Aufrufer kennt die Art über `DUPLICABLE`. */
function readList(state: object, field: string): { id: string }[] {
  const value = (state as Record<string, unknown>)[field];
  return Array.isArray(value) ? (value as { id: string }[]) : [];
}

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
  const spec = DUPLICABLE[entry.type];
  const copy = (spec.clone as (d: unknown, id: string, o: number) => unknown)(
    entry.data,
    newId,
    offset
  );

  const nextState = {
    ...state,
    [spec.field]: [...readList(state, spec.field), copy],
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
    const found = readList(state, DUPLICABLE[type].field).find((i) => i.id === elementId);
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
