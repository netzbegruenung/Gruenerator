// SPDX-License-Identifier: MPL-2.0
/**
 * Umschalt beim Ziehen sperrt die Bewegung auf eine Achse — die, auf der der
 * Zeiger seit dem Zugbeginn weiter gewandert ist. Eine Stelle für jedes
 * Element: die Bühne legt beim `dragstart` einen `dragBoundFunc` um den
 * gezogenen Knoten (einen eigenen umhüllt er) und nimmt ihn beim `dragend` wieder ab.
 *
 * Die Achse folgt dem Zeigerweg seit dem Druck (nicht seit `dragstart`, das
 * erst nach der Mindeststrecke kommt) und gilt für alle Knoten eines
 * Gruppenzugs gleich. Festgehalten wird je Knoten seine Lage bei seinem eigenen
 * `dragstart`: Konva startet die übrigen Knoten erst ein Bild später, nachdem
 * es sie um den (schon gesperrten) Weg des ersten verschoben hat.
 *
 * Den Snap auf der gesperrten Achse unterdrückt `snapByBounds` (`activeAxisLock`).
 */

import type Konva from 'konva';

export type DragAxis = 'x' | 'y';

interface Point {
  x: number;
  y: number;
}

let lockedAxis: DragAxis | null = null;

/** Die Achse, auf der der laufende Zug gesperrt ist — `null` ohne Umschalt. */
export function activeAxisLock(): DragAxis | null {
  return lockedAxis;
}

/** Gesperrte Lage: auf der schwächeren Achse des Zeigerwegs bleibt der Knoten bei `start`. */
export function lockToAxis(
  pos: Point,
  start: Point,
  pointer: Point,
  origin: Point
): { pos: Point; axis: DragAxis } {
  return Math.abs(pointer.x - origin.x) >= Math.abs(pointer.y - origin.y)
    ? { pos: { x: pos.x, y: start.y }, axis: 'x' }
    : { pos: { x: start.x, y: pos.y }, axis: 'y' };
}

type BoundFunc = (this: Konva.Node, pos: Point, evt: unknown) => Point;

const shiftHeld = (evt: unknown): boolean =>
  typeof evt === 'object' && evt !== null && (evt as { shiftKey?: unknown }).shiftKey === true;

/** Hängt die Sperre an die Bühne; gibt das Abmelden zurück. */
export function installAxisLock(stage: Konva.Stage): () => void {
  let origin: Point | null = null;
  let press: Point | null = null;
  const own = new Map<Konva.Node, BoundFunc | undefined>();
  // Im Capture: Elemente brechen das Blubbern ihres Drucks ab.
  const onPress = (evt: PointerEvent) => {
    stage.setPointersPositions(evt);
    press = stage.getPointerPosition();
  };
  stage.content.addEventListener('pointerdown', onPress, true);

  stage.on('dragstart.axisLock', (e) => {
    const node = e.target;
    if (node === stage || own.has(node)) return;
    if (own.size === 0) origin = press ?? stage.getPointerPosition();
    const previous = node.dragBoundFunc() as BoundFunc | undefined;
    const start = node.getAbsolutePosition();
    own.set(node, previous);
    node.dragBoundFunc(function (this: Konva.Node, pos: Point, evt: unknown) {
      const next = previous ? previous.call(this, pos, evt) : pos;
      const pointer = stage.getPointerPosition();
      if (!shiftHeld(evt) || !origin || !pointer) {
        lockedAxis = null;
        return next;
      }
      const locked = lockToAxis(next, start, pointer, origin);
      lockedAxis = locked.axis;
      return locked.pos;
    });
  });

  stage.on('dragend.axisLock', (e) => {
    const node = e.target;
    if (!own.has(node)) return;
    node.dragBoundFunc(own.get(node) as BoundFunc);
    own.delete(node);
    if (own.size === 0) {
      origin = null;
      lockedAxis = null;
    }
  });

  return () => {
    stage.content.removeEventListener('pointerdown', onPress, true);
    stage.off('.axisLock');
    own.forEach((previous, node) => node.dragBoundFunc(previous as BoundFunc));
    own.clear();
    lockedAxis = null;
  };
}
