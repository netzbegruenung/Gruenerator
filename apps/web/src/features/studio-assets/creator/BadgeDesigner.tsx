import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import {
  BADGE_DEFAULT_COLORS,
  BADGE_DEFAULT_TEXT,
  BADGE_LINE_HEIGHT,
  BADGE_MAX_LINES,
  BADGE_OUTLINE,
  BADGE_OUTLINE_COLOR,
  BADGE_PAD,
  BADGE_SHAPES,
  BADGE_TEXT_MAX,
  badgeGeometry,
  badgeLines,
  fitFontSize,
  STICKER_MAX_SIDE,
  stickerSwatches,
  swatchColor,
  type BadgeShapeId,
} from '@gruenerator/shared/stickers';
import { Button, Label, Slider, Textarea } from '@gruenerator/ui';
import { type KonvaEventObject } from 'konva/lib/Node';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Layer, Line, Path, Stage, Text, Transformer } from 'react-konva';

import { TOOL_HINT, TOOL_LABEL, TOOL_PILL } from '../../studio-tools/components/ToolUi';

import {
  StageFrame,
  SwatchPicker,
  SwitchRow,
  type DesignerParts,
  type StickerDraft,
} from './creatorParts';

import type Konva from 'konva';

import { cn } from '@/utils/cn';

/** Headline faces of the sharepic brand themes (packages/canvas-editor/src/brand/theme.ts). */
const BADGE_FONT = {
  'de-DE': { family: 'GrueneTypeNeue', lineHeight: BADGE_LINE_HEIGHT['de-DE'] },
  'de-AT': { family: 'GothamNarrow-Ultra', lineHeight: BADGE_LINE_HEIGHT['de-AT'] },
} as const;

const EXPORT_DELAY_MS = 250;
/** The text size relative to the size that just fits the shape. */
const TEXT_SCALE = { min: 0.4, max: 2, step: 0.05 };
/** Design units within which a dragged text clicks onto the centre lines. */
const SNAP = 18;
const NUDGE = 10;
const NUDGE_FAST = NUDGE * 10;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
/** Same handles as the Profilbild stage. */
const GUIDE_COLOR = BRAND_COLORS.GRASHALM;
const GUIDE_CASING = CANVAS_COLORS.TANNE;

interface TextPlacement {
  /** Offset of the text centre from the centre of the shape's text box, in design units. */
  dx: number;
  dy: number;
  scale: number;
}

const CENTERED: TextPlacement = { dx: 0, dy: 0, scale: 1 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const clampScale = (n: number) =>
  clamp(Math.round(n / TEXT_SCALE.step) * TEXT_SCALE.step, TEXT_SCALE.min, TEXT_SCALE.max);

let measureContext: CanvasRenderingContext2D | null = null;

/** Line width at font size 100; a rough per-character estimate where canvas is missing. */
function measureLine(family: string, line: string): number {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return line.length * 55;
  measureContext.font = `100px "${family}"`;
  return measureContext.measureText(line).width;
}

function useFontReady(family: string): boolean {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    const loading = fonts ? fonts.load(`100px "${family}"`) : Promise.resolve([]);
    void loading
      .catch(() => [])
      .then(() => {
        if (!cancelled) setReady(family);
      });
    return () => {
      cancelled = true;
    };
  }, [family]);
  return ready === family;
}

function useBoxWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function BadgeDesigner({
  locale,
  onDraft,
  children,
}: {
  locale: 'de-DE' | 'de-AT';
  onDraft: (draft: StickerDraft | null) => void;
  children: (parts: DesignerParts) => ReactNode;
}): JSX.Element {
  const textId = useId();
  const shapeLabelId = useId();
  const hintId = useId();
  const palette = stickerSwatches(locale);
  const colorOf = (id: string) => swatchColor(palette, id);
  const font = BADGE_FONT[locale];

  const [text, setText] = useState(BADGE_DEFAULT_TEXT);
  const [shape, setShape] = useState<BadgeShapeId>('stoerer');
  const [background, setBackground] = useState(() =>
    colorOf(BADGE_DEFAULT_COLORS[locale].background)
  );
  const [textColor, setTextColor] = useState(() => colorOf(BADGE_DEFAULT_COLORS[locale].text));
  const [outlineOn, setOutlineOn] = useState(true);
  const [placement, setPlacement] = useState<TextPlacement>(CENTERED);
  const [selected, setSelected] = useState(true);
  const [snapped, setSnapped] = useState<{ x: boolean; y: boolean } | null>(null);
  const fontReady = useFontReady(font.family);
  const [boxRef, boxWidth] = useBoxWidth(320);
  const stageRef = useRef<Konva.Stage>(null);
  const contentRef = useRef<Konva.Layer>(null);
  const textRef = useRef<Konva.Text>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const geometry = badgeGeometry(shape);
  const lines = badgeLines(text);
  const designW = geometry.width + 2 * BADGE_PAD;
  const designH = geometry.height + 2 * BADGE_PAD;
  const scale = (boxWidth * 0.88) / Math.max(designW, designH);
  const stageW = Math.round(designW * scale);
  const stageH = Math.round(designH * scale);
  const fittedSize = fitFontSize(
    lines,
    geometry.textBox,
    (line) => measureLine(font.family, line),
    font.lineHeight
  );
  const fontSize = Math.max(1, Math.round(fittedSize * placement.scale));
  const centerX = BADGE_PAD + geometry.textBox.x + geometry.textBox.width / 2;
  const centerY = BADGE_PAD + geometry.textBox.y + geometry.textBox.height / 2;
  // The text centre stays on the shape, wherever it is dragged.
  const textX = clamp(centerX + placement.dx, BADGE_PAD, BADGE_PAD + geometry.width);
  const textY = clamp(centerY + placement.dy, BADGE_PAD, BADGE_PAD + geometry.height);
  const tooManyLines = text.split('\n').filter((l) => l.trim()).length > BADGE_MAX_LINES;
  const linesKey = lines.join('\n');
  const scalePct = Math.round(placement.scale * 100);

  // Konva measures the text itself; centring it on its own box keeps x/y the text centre.
  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.offsetX(node.width() / 2);
    node.offsetY(node.height() / 2);
    node.getLayer()?.batchDraw();
  }, [linesKey, fontSize, fontReady, font.family]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    tr.nodes(selected && textRef.current && linesKey ? [textRef.current] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, linesKey, fontSize, textX, textY]);

  useEffect(() => {
    if (!fontReady || !linesKey) {
      onDraft(null);
      return;
    }
    // Until the new export is in, the old one is not what the stage shows.
    onDraft(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      const layer = contentRef.current;
      const stage = stageRef.current;
      if (!layer || !stage) return;
      // Only the badge layer: the selection handles and guides stay out of the sticker.
      const pixelRatio = STICKER_MAX_SIDE / Math.max(stage.width(), stage.height());
      void layer
        .toBlob({
          x: 0,
          y: 0,
          width: stage.width(),
          height: stage.height(),
          pixelRatio,
          mimeType: 'image/png',
        })
        .then((blob) => {
          if (cancelled || !(blob instanceof Blob)) return;
          onDraft({ blob, suggestedTitle: linesKey.replace(/\n/g, ' '), source: 'badge' });
        })
        .catch(() => !cancelled && onDraft(null));
    }, EXPORT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fontReady, linesKey, shape, background, textColor, outlineOn, scale, placement, onDraft]);

  const moveBy = (x: number, y: number) =>
    setPlacement((p) => ({
      ...p,
      dx: clamp(p.dx + x, BADGE_PAD - centerX, BADGE_PAD + geometry.width - centerX),
      dy: clamp(p.dy + y, BADGE_PAD - centerY, BADGE_PAD + geometry.height - centerY),
    }));
  const resizeTo = (next: number) => setPlacement((p) => ({ ...p, scale: clampScale(next) }));

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const x = clamp(node.x(), BADGE_PAD, BADGE_PAD + geometry.width);
    const y = clamp(node.y(), BADGE_PAD, BADGE_PAD + geometry.height);
    const snapX = Math.abs(x - centerX) < SNAP;
    const snapY = Math.abs(y - centerY) < SNAP;
    node.position({ x: snapX ? centerX : x, y: snapY ? centerY : y });
    setSnapped((prev) =>
      prev && prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }
    );
  };

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    setSnapped(null);
    setPlacement((p) => ({ ...p, dx: e.target.x() - centerX, dy: e.target.y() - centerY }));
  };

  const onTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target;
    const factor = node.scaleX();
    node.scale({ x: 1, y: 1 });
    setPlacement((p) => ({
      dx: node.x() - centerX,
      dy: node.y() - centerY,
      scale: clampScale(p.scale * factor),
    }));
  };

  const onStagePointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target.getParent()?.className === 'Transformer') return;
    setSelected(e.target === textRef.current);
  };

  const onKey = (e: KeyboardEvent) => {
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_FAST : NUDGE;
      moveBy(arrow[0] * step, arrow[1] * step);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      resizeTo(placement.scale + TEXT_SCALE.step * 2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      resizeTo(placement.scale - TEXT_SCALE.step * 2);
    } else if (e.key === 'Escape') {
      setSelected(false);
    }
  };

  const setCursor = (cursor: string) => {
    const el = stageRef.current?.container();
    if (el) el.style.cursor = cursor;
  };

  const strokeW = 2 / scale;
  const shapeLabel = BADGE_SHAPES.find((s) => s.id === shape)?.label ?? '';

  const stage = (
    <StageFrame
      role="application"
      tabIndex={0}
      aria-label={`Vorschau: ${shapeLabel}${lines.length ? ` mit „${lines.join(' ')}“` : ''}`}
      aria-describedby={hintId}
      onKeyDown={onKey}
    >
      <div ref={boxRef} className="flex size-full touch-pan-y items-center justify-center">
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={onStagePointerDown}
          onTouchStart={onStagePointerDown}
        >
          <Layer ref={contentRef}>
            <Path
              x={BADGE_PAD}
              y={BADGE_PAD}
              data={geometry.path}
              fill={background}
              stroke={BADGE_OUTLINE_COLOR}
              strokeEnabled={outlineOn}
              strokeWidth={BADGE_OUTLINE * 2}
              lineJoin="round"
              fillAfterStrokeEnabled
            />
            <Text
              ref={textRef}
              key={fontReady ? 'font' : 'fallback'}
              x={textX}
              y={textY}
              text={linesKey}
              fontFamily={font.family}
              fontSize={fontSize}
              lineHeight={font.lineHeight}
              fill={textColor}
              align="center"
              wrap="none"
              draggable
              onMouseEnter={() => setCursor('grab')}
              onMouseLeave={() => setCursor('')}
              onDragStart={() => {
                setSelected(true);
                setCursor('grabbing');
              }}
              onDragMove={onDragMove}
              onDragEnd={(e) => {
                setCursor('grab');
                onDragEnd(e);
              }}
              onTransformEnd={onTransformEnd}
            />
          </Layer>
          <Layer listening={false}>
            {snapped?.x ? <Guide points={[centerX, 0, centerX, designH]} stroke={strokeW} /> : null}
            {snapped?.y ? <Guide points={[0, centerY, designW, centerY]} stroke={strokeW} /> : null}
          </Layer>
          <Layer>
            <Transformer
              ref={transformerRef}
              keepRatio
              centeredScaling
              rotateEnabled={false}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              anchorStroke={GUIDE_CASING}
              anchorFill="#fff"
              anchorSize={12}
              anchorCornerRadius={6}
              anchorStrokeWidth={1.5}
              borderStroke={GUIDE_COLOR}
              borderStrokeWidth={1.5}
              boundBoxFunc={(oldBox, newBox) => {
                const ratio = Math.abs(newBox.width / oldBox.width);
                const next = placement.scale * ratio;
                return next < TEXT_SCALE.min || next > TEXT_SCALE.max ? oldBox : newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    </StageFrame>
  );

  const controls = (
    <>
      <div className="flex flex-col gap-xs">
        <Label htmlFor={textId} className={TOOL_LABEL}>
          Text
        </Label>
        <Textarea
          id={textId}
          rows={3}
          value={text}
          maxLength={BADGE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${textId}-hint`}
        />
        <p id={`${textId}-hint`} className={cn(TOOL_HINT, 'text-xs')}>
          {tooManyLines
            ? 'Nur die ersten drei Zeilen kommen auf den Sticker.'
            : 'Bis zu drei Zeilen. Auf dem Bild ziehst du den Text, an den Ecken änderst du die Größe.'}
        </p>
      </div>

      <div className="flex flex-col gap-sm">
        <div className="flex items-baseline justify-between gap-sm">
          <span className={TOOL_LABEL}>Textgröße</span>
          <span className="text-sm tabular-nums text-muted-foreground">{scalePct} %</span>
        </div>
        <Slider
          aria-label="Textgröße"
          min={TEXT_SCALE.min * 100}
          max={TEXT_SCALE.max * 100}
          step={TEXT_SCALE.step * 100}
          value={[scalePct]}
          onValueChange={([pct]) => {
            if (pct !== undefined) resizeTo(pct / 100);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={placement.dx === 0 && placement.dy === 0 && placement.scale === 1}
          onClick={() => setPlacement(CENTERED)}
        >
          Text zurücksetzen
        </Button>
      </div>

      <div role="group" aria-labelledby={shapeLabelId} className="flex flex-col gap-sm">
        <span id={shapeLabelId} className={TOOL_LABEL}>
          Form
        </span>
        <div className="flex flex-wrap gap-xs">
          {BADGE_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={shape === s.id}
              onClick={() => setShape(s.id)}
              className={cn(TOOL_PILL, 'px-sm')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <SwatchPicker
        label="Hintergrund"
        swatches={palette}
        value={background}
        onChange={setBackground}
        disabledColor={textColor}
      />
      <SwatchPicker
        label="Schrift"
        swatches={palette}
        value={textColor}
        onChange={setTextColor}
        disabledColor={background}
      />
      <SwitchRow label="Weiße Kontur" checked={outlineOn} onChange={setOutlineOn} />
    </>
  );

  return (
    <>
      {children({ stage, controls })}
      <p id={hintId} className="sr-only">
        Pfeiltasten verschieben den Text, Umschalt mit Pfeiltaste in großen Schritten, + und –
        ändern die Größe.
      </p>
    </>
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
