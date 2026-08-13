/**
 * Dev-only harness for `canvas-shape-resize.spec.ts`.
 *
 * Mounts a single `ShapePrimitive` on a bare Konva stage so a Playwright test can
 * drag the real Transformer anchors with real mouse events. The editor's own
 * routes need a backend, a document and the Elemente panel to reach the same
 * component — none of which say anything about resize geometry.
 *
 * Served by the Vite dev server at /tests/e2e/harness/shape-transform.html. It is
 * NOT part of the production build: `vite build` only walks index.html's graph.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layer, Stage } from 'react-konva';

import { ShapePrimitive } from '../../../../../packages/canvas-editor/src/primitives/ShapePrimitive';
import {
  createShape,
  type ShapeInstance,
  type ShapeType,
} from '../../../../../packages/canvas-editor/src/utils/shapes';

import type Konva from 'konva';

// Typen + window-Augmentierung liegen daneben, damit der Spec sie ohne
// react-konva-Import bekommt.
import './shapeHarness';

const STAGE_SIZE = 700;
const SHAPE_CENTER = STAGE_SIZE / 2;

function Harness() {
  const params = new URLSearchParams(window.location.search);
  const type = (params.get('type') ?? 'x-mark') as ShapeType;

  const stageRef = useRef<Konva.Stage>(null);
  const [shape, setShape] = useState<ShapeInstance>(() => ({
    ...createShape(type, SHAPE_CENTER, SHAPE_CENTER, '#005538'),
    id: 'harness-shape',
  }));

  const handleChange = useCallback((attrs: Partial<ShapeInstance>) => {
    setShape((prev) => ({ ...prev, ...attrs }));
  }, []);

  // Ohne Abhängigkeitsliste: nach JEDEM Render neu veröffentlichen, sonst liest
  // der Test nach einem Transform noch die alte Größe. Im Effect statt im
  // Render-Body, weil der Render-Body seitenwirkungsfrei bleiben muss.
  useEffect(() => {
    window.__shapeHarness = {
      shape,
      anchorPos: (name) => {
        const stage = stageRef.current;
        const anchor = stage?.findOne(`.${name}`);
        if (!stage || !anchor) return null;
        const pos = anchor.getAbsolutePosition();
        const rect = stage.container().getBoundingClientRect();
        return { x: rect.left + pos.x, y: rect.top + pos.y };
      },
      renderedBox: () => {
        const stage = stageRef.current;
        const node = stage?.findOne(`.shape-${shape.id}`);
        if (!stage || !node) return null;
        const box = node.getClientRect();
        const rect = stage.container().getBoundingClientRect();
        return { x: rect.left + box.x, y: rect.top + box.y, width: box.width, height: box.height };
      },
    };
  });

  return (
    <Stage ref={stageRef} width={STAGE_SIZE} height={STAGE_SIZE}>
      <Layer>
        <ShapePrimitive shape={shape} isSelected onSelect={() => {}} onChange={handleChange} />
      </Layer>
    </Stage>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
