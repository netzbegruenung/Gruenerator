import { type KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva';

import { PROFILBILD_SIZE } from '../utils/composeProfilbild';
import { clampPerson, gridLines, snapPerson } from '../utils/profilbildSnap';

const SIZE = PROFILBILD_SIZE;
const GRID_COLOR = 'rgba(255,255,255,0.55)';
const GUIDE_COLOR = '#ff2d9b';

export interface ProfilbildStageProps {
  background: HTMLCanvasElement;
  person: CanvasImageSource & { width: number; height: number };
  rect: { x: number; y: number; width: number; height: number };
  round: boolean;
  onMove: (pos: { x: number; y: number }) => void;
}

export default function ProfilbildStage({
  background,
  person,
  rect,
  round,
  onMove,
}: ProfilbildStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const setCursor = (cursor: string) => {
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  };

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const clamped = clampPerson({ ...rect, x: node.x(), y: node.y() }, SIZE);
    const snapped = snapPerson({ ...rect, ...clamped }, SIZE);
    node.position({ x: snapped.x, y: snapped.y });
    setGuides((g) =>
      g.x === snapped.guideX && g.y === snapped.guideY
        ? g
        : { x: snapped.guideX, y: snapped.guideY }
    );
  };

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    setDragging(false);
    setGuides({ x: null, y: null });
    setCursor('grab');
    onMove({ x: e.target.x(), y: e.target.y() });
  };

  const scale = width / SIZE;
  const lines = gridLines(SIZE);
  const stroke = 2 / scale;

  return (
    <div ref={containerRef} className="aspect-square w-full touch-none">
      <Stage width={width} height={width} scaleX={scale} scaleY={scale}>
        <Layer listening={false}>
          <KonvaImage image={background} width={SIZE} height={SIZE} />
        </Layer>
        <Layer>
          <KonvaImage
            image={person}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            draggable
            onMouseEnter={() => setCursor('grab')}
            onMouseLeave={() => setCursor('')}
            onDragStart={() => {
              setDragging(true);
              setCursor('grabbing');
            }}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        </Layer>
        <Layer listening={false}>
          {round ? (
            <>
              <Rect width={SIZE} height={SIZE} fill="rgba(0,0,0,0.45)" />
              <Circle
                x={SIZE / 2}
                y={SIZE / 2}
                radius={SIZE / 2}
                fill="#000"
                globalCompositeOperation="destination-out"
              />
              <Circle
                x={SIZE / 2}
                y={SIZE / 2}
                radius={SIZE / 2 - stroke / 2}
                stroke="rgba(255,255,255,0.8)"
                strokeWidth={stroke}
              />
            </>
          ) : null}
          {dragging
            ? lines.flatMap((p) => [
                <Line
                  key={`v${p}`}
                  points={[p, 0, p, SIZE]}
                  stroke={guides.x === p ? GUIDE_COLOR : GRID_COLOR}
                  strokeWidth={guides.x === p ? stroke * 1.5 : stroke}
                  dash={guides.x === p ? [] : [12, 10]}
                />,
                <Line
                  key={`h${p}`}
                  points={[0, p, SIZE, p]}
                  stroke={guides.y === p ? GUIDE_COLOR : GRID_COLOR}
                  strokeWidth={guides.y === p ? stroke * 1.5 : stroke}
                  dash={guides.y === p ? [] : [12, 10]}
                />,
              ])
            : null}
          {dragging && guides.y === SIZE ? (
            <Line
              points={[0, SIZE - stroke, SIZE, SIZE - stroke]}
              stroke={GUIDE_COLOR}
              strokeWidth={stroke * 3}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  );
}
