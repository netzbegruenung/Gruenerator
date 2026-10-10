import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import { type KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';

import { PROFILBILD_SIZE } from '../utils/composeProfilbild';
import { clampPerson, gridLines, snapPerson, snapSticker } from '../utils/profilbildSnap';
import {
  MIN_STICKER,
  type PlacedSticker,
  type StickerChange,
  stickerBox,
} from '../utils/profilbildStickers';

import type Konva from 'konva';

const SIZE = PROFILBILD_SIZE;
const GRID_COLOR = 'rgba(255,255,255,0.55)';
/** Grashalm on a dark Tanne casing: the light core shows on dark grounds, the casing on light ones. */
const GUIDE_COLOR = BRAND_COLORS.GRASHALM;
const GUIDE_CASING = CANVAS_COLORS.TANNE;

export interface ProfilbildStageProps {
  background: HTMLCanvasElement;
  person: CanvasImageSource & { width: number; height: number };
  rect: { x: number; y: number; width: number; height: number };
  round: boolean;
  onMove: (pos: { x: number; y: number }) => void;
  stickers: PlacedSticker[];
  selectedSticker: string | null;
  onSelectSticker: (uid: string | null) => void;
  onStickerChange: (uid: string, next: StickerChange) => void;
}

export default function ProfilbildStage({
  background,
  person,
  rect,
  round,
  onMove,
  stickers,
  selectedSticker,
  onSelectSticker,
  onStickerChange,
}: ProfilbildStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stickerNodes = useRef(new Map<string, Konva.Image>());
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

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedSticker ? stickerNodes.current.get(selectedSticker) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedSticker, stickers]);

  const setCursor = (cursor: string) => {
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  };

  const showGuides = (g: { guideX: number | null; guideY: number | null }) =>
    setGuides((prev) =>
      prev.x === g.guideX && prev.y === g.guideY ? prev : { x: g.guideX, y: g.guideY }
    );

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const clamped = clampPerson({ ...rect, x: node.x(), y: node.y() }, SIZE);
    const snapped = snapPerson({ ...rect, ...clamped }, SIZE);
    node.position({ x: snapped.x, y: snapped.y });
    showGuides(snapped);
  };

  const endDrag = () => {
    setDragging(false);
    setGuides({ x: null, y: null });
    setCursor('grab');
  };

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    endDrag();
    onMove({ x: e.target.x(), y: e.target.y() });
  };

  const nodeBox = (node: Konva.Node, s: PlacedSticker) =>
    stickerBox(s, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    });

  const onStickerDragMove = (s: PlacedSticker) => (e: KonvaEventObject<DragEvent>) => {
    const snapped = snapSticker(nodeBox(e.target, s), SIZE);
    e.target.position({ x: snapped.x, y: snapped.y });
    showGuides(snapped);
  };

  const onStickerDragEnd = (s: PlacedSticker) => (e: KonvaEventObject<DragEvent>) => {
    endDrag();
    onStickerChange(s.uid, nodeBox(e.target, s));
  };

  const onStickerTransformEnd = (s: PlacedSticker) => (e: KonvaEventObject<Event>) => {
    const node = e.target;
    const next = nodeBox(node, s);
    node.scale({ x: 1, y: 1 });
    onStickerChange(s.uid, next);
  };

  const onStagePointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const target = e.target;
    if (target.getParent()?.className === 'Transformer') return;
    if (!stickers.some((s) => stickerNodes.current.get(s.uid) === target)) onSelectSticker(null);
  };

  const scale = width / SIZE;
  const lines = gridLines(SIZE);
  const stroke = 2 / scale;

  return (
    // pan-y lets a swipe on the empty background scroll the page; Konva cancels
    // touchstart on the listening person, stickers and handles so dragging them still works
    <div ref={containerRef} className="aspect-square w-full touch-pan-y">
      <Stage
        width={width}
        height={width}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={onStagePointerDown}
        onTouchStart={onStagePointerDown}
      >
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
          {stickers.map((s) => (
            <KonvaImage
              key={s.uid}
              ref={(node) => {
                if (node) stickerNodes.current.set(s.uid, node);
                else stickerNodes.current.delete(s.uid);
              }}
              image={s.image}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              offsetX={s.width / 2}
              offsetY={s.height / 2}
              rotation={s.rotation}
              draggable
              onMouseEnter={() => setCursor('grab')}
              onMouseLeave={() => setCursor('')}
              onMouseDown={() => onSelectSticker(s.uid)}
              onTouchStart={() => onSelectSticker(s.uid)}
              onDragStart={() => {
                onSelectSticker(s.uid);
                setDragging(true);
                setCursor('grabbing');
              }}
              onDragMove={onStickerDragMove(s)}
              onDragEnd={onStickerDragEnd(s)}
              onTransformEnd={onStickerTransformEnd(s)}
            />
          ))}
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
                guides.x === p ? null : (
                  <Line
                    key={`v${p}`}
                    points={[p, 0, p, SIZE]}
                    stroke={GRID_COLOR}
                    strokeWidth={stroke}
                    dash={[12, 10]}
                  />
                ),
                guides.y === p ? null : (
                  <Line
                    key={`h${p}`}
                    points={[0, p, SIZE, p]}
                    stroke={GRID_COLOR}
                    strokeWidth={stroke}
                    dash={[12, 10]}
                  />
                ),
              ])
            : null}
          {dragging && guides.x !== null ? (
            <Guide points={[guides.x, 0, guides.x, SIZE]} stroke={stroke} />
          ) : null}
          {dragging && guides.y !== null ? (
            <Guide
              points={
                guides.y === SIZE
                  ? [0, SIZE - stroke * 1.5, SIZE, SIZE - stroke * 1.5]
                  : [0, guides.y, SIZE, guides.y]
              }
              stroke={guides.y === SIZE ? stroke * 2 : stroke}
            />
          ) : null}
        </Layer>
        <Layer>
          <Transformer
            ref={transformerRef}
            keepRatio
            rotateEnabled
            rotationSnaps={[0, 90, 180, 270]}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            anchorStroke={GUIDE_CASING}
            anchorFill="#fff"
            anchorSize={12}
            anchorCornerRadius={6}
            anchorStrokeWidth={1.5}
            borderStroke={GUIDE_COLOR}
            borderStrokeWidth={1.5}
            rotateAnchorOffset={24}
            boundBoxFunc={(oldBox, newBox) =>
              Math.abs(newBox.width) < MIN_STICKER * scale ||
              Math.abs(newBox.height) < MIN_STICKER * scale
                ? oldBox
                : newBox
            }
          />
        </Layer>
      </Stage>
    </div>
  );
}

function Guide({ points, stroke }: { points: number[]; stroke: number }) {
  return (
    <>
      <Line points={points} stroke={GUIDE_CASING} strokeWidth={stroke * 3} opacity={0.85} />
      <Line points={points} stroke={GUIDE_COLOR} strokeWidth={stroke * 1.5} />
    </>
  );
}
