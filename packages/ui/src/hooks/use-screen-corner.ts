import * as React from 'react';

/** Bildschirmecke, an der ein schwebendes Element verankert ist. */
export type ScreenCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const SCREEN_CORNERS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const satisfies readonly ScreenCorner[];

/** Was an einer Ecke schon belegt ist — Längen sind rohe CSS-Werte, keine Pixel. */
export interface CornerClearance {
  /** Belegte Höhe ab der waagerechten Kante (top bzw. bottom). */
  vertical: string | null;
  /** Belegte Breite ab der senkrechten Kante (left bzw. right). */
  horizontal: string | null;
  /** Die Ecke ist ganz zugedeckt — dort verankerte Overlays blenden sich aus. */
  blocked: boolean;
}

export interface CornerReservation {
  /** Ecke(n), die dieses Element belegt. Kantenfüllende Leisten melden beide. */
  corner: ScreenCorner | readonly ScreenCorner[];
  /** Ausdehnung ab der waagerechten Kante, z. B. `'calc(4.5rem + env(safe-area-inset-bottom))'`. */
  vertical?: string;
  /** Ausdehnung ab der senkrechten Kante, z. B. `'20rem'`. */
  horizontal?: string;
  /** Ecke vollständig zugedeckt (Vollbild-Panel) — Nachbarn sollen verschwinden. */
  blocked?: boolean;
  /** `false` meldet nichts an, etwa bei geschlossenem Panel. Default `true`. */
  active?: boolean;
}

const EMPTY: CornerClearance = { vertical: null, horizontal: null, blocked: false };

type Entry = { vertical: string | null; horizontal: string | null; blocked: boolean };

const entries = new Map<ScreenCorner, Map<number, Entry>>();
const snapshots = new Map<ScreenCorner, CornerClearance>();
const listeners = new Set<() => void>();
let nextId = 0;

// Mehrere Anmeldungen an derselben Ecke werden nicht in JS verrechnet, sondern
// als CSS-`max()` weitergereicht: nur so dürfen Reservierungen `env()`, `rem`
// und `%` mischen, ohne dass wir die Einheiten selbst auflösen müssten.
function fold(values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0] ?? null;
  return `max(${values.join(', ')})`;
}

function recompute(corner: ScreenCorner): void {
  const forCorner = entries.get(corner);
  if (!forCorner || forCorner.size === 0) {
    snapshots.delete(corner);
    return;
  }
  const vertical: string[] = [];
  const horizontal: string[] = [];
  let blocked = false;
  for (const entry of forCorner.values()) {
    if (entry.vertical) vertical.push(entry.vertical);
    if (entry.horizontal) horizontal.push(entry.horizontal);
    if (entry.blocked) blocked = true;
  }
  snapshots.set(corner, { vertical: fold(vertical), horizontal: fold(horizontal), blocked });
}

interface Registration {
  update: (entry: Entry) => void;
  release: () => void;
}

function register(corners: readonly ScreenCorner[], entry: Entry): Registration {
  const id = nextId++;
  const write = (next: Entry): void => {
    for (const c of corners) {
      let forCorner = entries.get(c);
      if (!forCorner) {
        forCorner = new Map();
        entries.set(c, forCorner);
      }
      forCorner.set(id, next);
      recompute(c);
    }
    notify();
  };
  write(entry);
  return {
    update: write,
    release: () => {
      for (const c of corners) {
        entries.get(c)?.delete(id);
        recompute(c);
      }
      notify();
    },
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Meldet an, dass dieses Element eine Bildschirmecke belegt. Frei schwebende
 * Nachbarn (der Feedback-Button) rücken darüber oder daneben, statt sie zu
 * verdecken. Die Anmeldung endet mit dem Unmount.
 */
export function useScreenCornerReservation({
  corner,
  vertical,
  horizontal,
  blocked = false,
  active = true,
}: CornerReservation): void {
  // Der Ecken-Schlüssel als String, damit ein inline übergebenes Array die
  // Anmeldung nicht bei jedem Render ab- und wieder aufbaut.
  const key = Array.isArray(corner) ? corner.join('|') : (corner as ScreenCorner);

  React.useEffect(() => {
    if (!active) return undefined;
    const { release } = register(key.split('|') as ScreenCorner[], {
      vertical: vertical ?? null,
      horizontal: horizontal ?? null,
      blocked,
    });
    return release;
  }, [key, vertical, horizontal, blocked, active]);
}

/** Liest, was an einer Ecke belegt ist. */
export function useCornerClearance(corner: ScreenCorner): CornerClearance {
  const getSnapshot = React.useCallback(() => snapshots.get(corner) ?? EMPTY, [corner]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/**
 * Positions-Style für ein an `corner` verankertes Element, das die dortigen
 * Reservierungen respektiert. `base` ist der Abstand zur Kante im freien Fall.
 */
export function cornerInsetStyle(
  corner: ScreenCorner,
  clearance: CornerClearance,
  base = '1rem'
): React.CSSProperties {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return {
    [vertical]: clearance.vertical ? `calc(${base} + ${clearance.vertical})` : base,
    [horizontal]: clearance.horizontal ? `calc(${base} + ${clearance.horizontal})` : base,
  };
}

export interface MeasuredCornerReservation {
  corner: ScreenCorner | readonly ScreenCorner[];
  /** Welche Ausdehnung gemessen wird — eine Leiste am unteren Rand: `'vertical'`. */
  axis: 'vertical' | 'horizontal';
  blocked?: boolean;
  active?: boolean;
}

/**
 * Wie {@link useScreenCornerReservation}, misst die Ausdehnung aber am
 * Element statt sie zu deklarieren. Für Leisten, deren Höhe am Inhalt hängt
 * (Seiten-Streifen im Canvas-Editor) — ein fester Wert würde dort veralten,
 * sobald jemand die Leiste umbaut.
 */
export function useMeasuredCornerReservation(
  ref: React.RefObject<HTMLElement | null>,
  { corner, axis, blocked = false, active = true }: MeasuredCornerReservation
): void {
  const key = Array.isArray(corner) ? corner.join('|') : (corner as ScreenCorner);

  React.useEffect(() => {
    const element = ref.current;
    if (!active || !element) return undefined;

    const corners = key.split('|') as ScreenCorner[];
    const registration = register(corners, { vertical: null, horizontal: null, blocked });

    // Gemessen wird der Abstand von der Kante bis zur inneren Elementgrenze —
    // dadurch braucht die Anmeldung den eigenen Offset des Elements nicht zu
    // kennen und stimmt auch, wenn es nicht bündig an der Kante klebt.
    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      // Eine per Media-Query ausgeblendete Leiste misst 0×0 — ohne diese
      // Abkürzung läse sich das als "belegt die ganze Kante".
      if (rect.width === 0 && rect.height === 0) {
        registration.update({ vertical: null, horizontal: null, blocked });
        return;
      }
      const edge = corners[0]?.split('-') ?? [];
      const extent =
        axis === 'vertical'
          ? edge[0] === 'top'
            ? rect.bottom
            : window.innerHeight - rect.top
          : edge[1] === 'left'
            ? rect.right
            : window.innerWidth - rect.left;
      const length = `${Math.max(0, Math.round(extent))}px`;
      registration.update(
        axis === 'vertical'
          ? { vertical: length, horizontal: null, blocked }
          : { vertical: null, horizontal: length, blocked }
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      registration.release();
    };
  }, [ref, key, axis, blocked, active]);
}
