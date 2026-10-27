/**
 * Mehrfachauswahl: Shift-Klick und Auswahlrahmen wählen mehrere Elemente, der
 * gemeinsame Transformer zieht sie zusammen, und jedes schreibt seine neue
 * Position über seinen eigenen `dragend` zurück.
 */
import {
  findDragNodes,
  isGroupDrag,
  MULTI_SELECTION_TRANSFORMER_NAME,
} from '@ggraphic/editor/utils/multiSelect';
import { act, render } from '@testing-library/react';
import { createRef, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Group } from 'react-konva';
import { describe, expect, it } from 'vitest';

import { MultiSelectionTransformer } from '../../components/MultiSelectionTransformer';
import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { ShapePrimitive } from '../../primitives/ShapePrimitive';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '../../stores/CanvasStoreProvider';
import { createShape, type ShapeInstance } from '../../utils/shapes';
import { useCanvasHistorySetup } from '../useCanvasHistorySetup';
import { useCanvasInteractions } from '../useCanvasInteractions';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';
import type Konva from 'konva';

// Mittelpunkt-verankert; die jsdom-Leinwand misst 300×150.
const box = (id: string, x: number, y: number): ShapeInstance => ({
  ...createShape('rect', x, y, '#888888', '#888888'),
  id,
  width: 80,
  height: 50,
});
// a: 10–90 × 15–65, b: 160–240 × 15–65, c: 160–240 × 90–140
const SHAPES = [box('a', 50, 40), box('b', 200, 40), box('c', 200, 115)];

function Host({
  stageRef,
  storeRef,
  beginRef,
  onChange,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  storeRef: { current: CanvasEditorStoreApi | null };
  beginRef: { current: ((evt: MouseEvent) => void) | null };
  onChange: (id: string, attrs: Partial<ShapeInstance>) => void;
}) {
  storeRef.current = useCanvasStore();
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const { selectElement, handleStageClick, beginMarquee } = useCanvasInteractions({
    stageRef,
    marqueeEnabled: true,
  });
  beginRef.current = beginMarquee;
  return (
    <CanvasStage
      ref={stageRef}
      width={300}
      height={150}
      responsive={false}
      onStageClick={handleStageClick}
    >
      {SHAPES.map((shape) => (
        <Group key={shape.id} name="canvas-item" canvasItemId={shape.id}>
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={selectElement}
            onChange={(attrs) => onChange(shape.id, attrs)}
          />
        </Group>
      ))}
      <MultiSelectionTransformer renderKey={SHAPES} canRotate={() => false} />
    </CanvasStage>
  );
}

function mount() {
  const stageRef = createRef<CanvasStageRef>();
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const beginMarquee: { current: ((evt: MouseEvent) => void) | null } = { current: null };
  const changes: Array<[string, Partial<ShapeInstance>]> = [];
  render(
    <CanvasStoreProvider>
      <Host
        stageRef={stageRef}
        storeRef={storeRef}
        beginRef={beginMarquee}
        onChange={(id, attrs) => changes.push([id, attrs])}
      />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const fire = (target: EventTarget, type: string, x: number, y: number, shift: boolean) =>
    act(() => {
      const init = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
        shiftKey: shift,
      };
      // Wie im Browser: erst das Pointer-, dann das Maus-Ereignis.
      const pointerType = type.replace('mouse', 'pointer');
      target.dispatchEvent(new MouseEvent(pointerType, init));
      target.dispatchEvent(new MouseEvent(type, init));
    });
  const click = (x: number, y: number, shift = false) => {
    fire(stage.content, 'mousedown', x, y, shift);
    fire(window, 'mouseup', x, y, shift);
  };
  const drag = (x: number, y: number, dx: number, dy: number, shift = false) => {
    fire(stage.content, 'mousedown', x, y, shift);
    for (let step = 1; step <= 4; step++) {
      fire(window, 'mousemove', x + (dx * step) / 4, y + (dy * step) / 4, shift);
    }
    fire(window, 'mouseup', x + dx, y + dy, shift);
  };
  const state = () => storeRef.current!.getState();
  return { stage, state, click, drag, fire, changes, store: storeRef, beginMarquee };
}

/** Der Auswahlrahmen ist ein festes DOM-Element über der Seite. */
const marqueeOverlay = () =>
  [...document.body.children].find(
    (el): el is HTMLElement => el instanceof HTMLElement && el.style.position === 'fixed'
  ) ?? null;

describe('Mehrfachauswahl', () => {
  it('Shift-Klick sammelt Elemente; der gemeinsame Transformer umfasst sie', () => {
    const { stage, state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    expect(state().selectedElement).toBeNull();
    const [nodeA] = findDragNodes(stage, ['a']);
    expect(isGroupDrag(nodeA!)).toBe(true);
  });

  it('Ziehen eines Elements bewegt die ganze Auswahl, jedes schreibt zurück', () => {
    const { stage, state, click, drag, changes } = mount();
    click(50, 40);
    click(200, 40, true);
    drag(50, 40, 30, 20);
    const moved = Object.fromEntries(changes);
    expect(Object.keys(moved).sort()).toEqual(['a', 'b']);
    expect(moved.a).toMatchObject({ x: 80, y: 60 });
    expect(moved.b).toMatchObject({ x: 230, y: 60 });
    // Je Element ein Umriss, der dem Zug gefolgt ist.
    const outlineXs = stage
      .find('.selection-chrome')
      .filter((node) => node.visible())
      .map((node) => Math.round(node.x()))
      .sort((p, q) => p - q);
    expect(outlineXs).toEqual([40, 190]);
    // Ein Zug klappt die Auswahl nicht zusammen.
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('Klick ohne Ziehen auf ein Element der Auswahl klappt auf dieses zusammen', () => {
    const { state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    click(200, 40);
    expect(state().selectedLayerIds).toEqual(['b']);
    expect(state().selectedElement).toBe('b');
  });

  it('Auswahlrahmen auf leerer Fläche wählt jedes geschnittene Element', () => {
    const { state, drag } = mount();
    drag(5, 5, 245, 70);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('der Rahmen zeigt seine Treffer schon während des Zugs, ohne den Store anzufassen', () => {
    const { stage, state, fire, store } = mount();
    let writes = 0;
    const unsubscribe = store.current!.subscribe(() => {
      writes += 1;
    });
    fire(stage.content, 'mousedown', 5, 5, false);
    for (let step = 1; step <= 4; step++)
      fire(window, 'mousemove', 5 + 60 * step, 5 + 17 * step, false);
    const visibleOutlines = () => stage.find('.selection-chrome').filter((node) => node.visible());
    expect(visibleOutlines()).toHaveLength(2);
    expect(marqueeOverlay()).not.toBeNull();
    expect(writes).toBe(0);
    fire(window, 'mouseup', 245, 73, false);
    unsubscribe();
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    // Der Rahmen ist weg; die Auswahl trägt ihre zwei Element-Umrisse.
    expect(marqueeOverlay()).toBeNull();
    expect(visibleOutlines()).toHaveLength(2);
  });

  it('ein Rahmen darf außerhalb der Bühne beginnen (Arbeitsfläche)', () => {
    const { state, fire, beginMarquee } = mount();
    const down = new MouseEvent('mousedown', { button: 0, clientX: -40, clientY: -20 });
    act(() => beginMarquee.current!(down));
    for (let step = 1; step <= 4; step++)
      fire(window, 'mousemove', -40 + 70 * step, -20 + 23 * step, false);
    fire(window, 'mouseup', 240, 72, false);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('Shift-Rahmen ergänzt die bestehende Auswahl', () => {
    const { state, click, drag } = mount();
    click(50, 40);
    drag(150, 145, 95, -20, true);
    expect(state().selectedLayerIds).toEqual(['a', 'c']);
  });

  it('ein Klick auf leere Fläche hebt die Auswahl auf', () => {
    const { state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    click(120, 100);
    expect(state().selectedLayerIds).toEqual([]);
  });
});

type Rotatable = Pick<ShapeInstance, 'id' | 'x' | 'y' | 'rotation'>;

/** Wie die Seite: jede Form schreibt über ihre Aktion, `c` sofort, die anderen entprellt. */
function HistoryHost({
  stageRef,
  api,
  canRotate,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  canRotate: { current: boolean };
  api: { current: { undo: () => void; shapes: () => Rotatable[] } | null };
}) {
  const [shapes, setShapes] = useState<ShapeInstance[]>(SHAPES);
  // Wie `committedStateRef` der Seite: erst nach dem Commit lesbar.
  const shapesRef = useRef(shapes);
  useLayoutEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);
  const latestRef = useRef(shapes);
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const { selectElement, handleStageClick } = useCanvasInteractions({
    stageRef,
    marqueeEnabled: true,
  });
  const collect = useCallback(() => ({ shapes: shapesRef.current }), []);
  const restore = useCallback((state: { shapes: ShapeInstance[] }) => setShapes(state.shapes), []);
  const { saveToHistory, debouncedSaveToHistory, undo } = useCanvasHistorySetup(collect, restore);
  api.current = { undo, shapes: () => shapesRef.current };
  const change = (id: string, attrs: Partial<ShapeInstance>) => {
    latestRef.current = latestRef.current.map((s) => (s.id === id ? { ...s, ...attrs } : s));
    setShapes(latestRef.current);
    if (id === 'c') saveToHistory();
    else debouncedSaveToHistory();
  };
  return (
    <CanvasStage
      ref={stageRef}
      width={300}
      height={150}
      responsive={false}
      onStageClick={handleStageClick}
    >
      {shapes.map((shape) => (
        <Group key={shape.id} name="canvas-item" canvasItemId={shape.id}>
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={selectElement}
            onChange={(attrs) => change(shape.id, attrs)}
          />
        </Group>
      ))}
      <MultiSelectionTransformer renderKey={shapes} canRotate={() => canRotate.current} />
    </CanvasStage>
  );
}

describe('Mehrfachauswahl drehen', () => {
  function mountHistory() {
    const stageRef = createRef<CanvasStageRef>();
    const api: { current: { undo: () => void; shapes: () => Rotatable[] } | null } = {
      current: null,
    };
    const canRotate = { current: true };
    const storeApi: { current: CanvasEditorStoreApi | null } = { current: null };
    function Probe() {
      storeApi.current = useCanvasStore();
      return null;
    }
    render(
      <CanvasStoreProvider>
        <Probe />
        <HistoryHost stageRef={stageRef} api={api} canRotate={canRotate} />
      </CanvasStoreProvider>
    );
    const stage = stageRef.current!.getStage()!;
    act(() => {
      stage.draw();
    });
    const select = (ids: string[]) =>
      act(() => {
        storeApi.current!.getState().setSelectedLayers(ids);
      });
    /** Dreht die Knoten um den Mittelpunkt (cx, cy) und beendet den Transformer wie Konva. */
    const rotateGroup = (ids: string[], cx: number, cy: number, deg: number) =>
      act(() => {
        const tr = stage.findOne(`.${MULTI_SELECTION_TRANSFORMER_NAME}`) as Konva.Transformer;
        const rad = (deg * Math.PI) / 180;
        for (const node of findDragNodes(stage, ids)) {
          const dx = node.x() - cx;
          const dy = node.y() - cy;
          node.setAttrs({
            x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
            y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
            rotation: node.rotation() + deg,
          });
        }
        // Konvas eigenes Ende: erst der Transformer, dann jeder Knoten.
        const internal = tr as unknown as {
          _transforming: boolean;
          _removeEvents: (e: unknown) => void;
        };
        internal._transforming = true;
        internal._removeEvents({});
      });
    return { api, select, rotateGroup, stage, canRotate };
  }

  it('dreht beide Formen um den Mittelpunkt der Auswahl, mit Drehung 90', () => {
    const { api, select, rotateGroup } = mountHistory();
    select(['a', 'b']);
    rotateGroup(['a', 'b'], 125, 40, 90);
    const [a, b] = api.current!.shapes();
    expect(a).toMatchObject({ rotation: 90 });
    expect(b).toMatchObject({ rotation: 90 });
    expect(a!.x).toBeCloseTo(125);
    expect(a!.y).toBeCloseTo(-35);
    expect(b!.x).toBeCloseTo(125);
    expect(b!.y).toBeCloseTo(115);
  });

  it.each([
    ['a', 'b', 'c'],
    ['c', 'a', 'b'],
    ['a', 'c', 'b'],
  ])(
    '[RF 2] ein Undo stellt alle wieder her, auch mit sofort speichernder Form (%s%s%s)',
    async (...ids) => {
      const { api, select, rotateGroup } = mountHistory();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      select(ids);
      rotateGroup(ids, 125, 77.5, 90);
      expect(api.current!.shapes().every((s) => s.rotation === 90)).toBe(true);
      const initial = SHAPES.map((s) => [s.id, s.x, s.y, s.rotation]);
      act(() => api.current!.undo());
      expect(api.current!.shapes().map((s) => [s.id, s.x, s.y, s.rotation])).toEqual(initial);
    }
  );

  it('der Transformer dreht nur, wenn alles Gewählte sich drehen lässt, und rastet ein', () => {
    const { stage, select } = mountHistory();
    select(['a', 'b']);
    const tr = stage.findOne(`.${MULTI_SELECTION_TRANSFORMER_NAME}`) as Konva.Transformer;
    expect(tr.rotateEnabled()).toBe(true);
    expect(tr.rotationSnaps()).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(tr.resizeEnabled()).toBe(false);
  });

  it('ein nicht drehbares Element in der Auswahl schaltet das Drehen aus', () => {
    const { stage, select, canRotate } = mountHistory();
    canRotate.current = false;
    select(['a', 'b']);
    const tr = stage.findOne(`.${MULTI_SELECTION_TRANSFORMER_NAME}`) as Konva.Transformer;
    expect(tr.rotateEnabled()).toBe(false);
  });
});
