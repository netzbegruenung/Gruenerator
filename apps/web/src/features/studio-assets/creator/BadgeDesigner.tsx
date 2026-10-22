import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import {
  BADGE_DEFAULT_COLORS,
  BADGE_DEFAULT_TEXT,
  BADGE_LINE_HEIGHT,
  BADGE_MAX_LINES,
  BADGE_OUTLINE,
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
import { Button, Label, Slider, Textarea, ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
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
import { Image as KonvaImage, Layer, Line, Path, Stage, Text, Transformer } from 'react-konva';

import { TOOL_HINT, TOOL_LABEL, TOOL_PILL } from '../../studio-tools/components/ToolUi';

import {
  StageFrame,
  SwatchPicker,
  SwitchRow,
  type DesignerParts,
  type StickerDraft,
} from './creatorParts';
import { useElementImages } from './stickerElementImages';
import { StickerElementPicker, type StickerElementPick } from './StickerElementPicker';

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

/** An emoji or icon on the badge; x/y is its centre, size its height, in design units. */
type PlacedElement = StickerElementPick & {
  uid: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

/** What the transformer holds: the text, one element (by uid), or nothing. */
const TEXT = 'text';

const PANELS = [
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form' },
  { id: 'farben', label: 'Farben' },
  { id: 'emojis', label: 'Emojis' },
  { id: 'icons', label: 'Icons' },
] as const;
type Panel = (typeof PANELS)[number]['id'];
const MIN_ELEMENT = 40;
const ROTATE_STEP = 15;
let nextUid = 0;

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
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [outlineOn, setOutlineOn] = useState(true);
  const [outlineColor, setOutlineColor] = useState(() => colorOf('weiss'));
  const [placement, setPlacement] = useState<TextPlacement>(CENTERED);
  const [elements, setElements] = useState<PlacedElement[]>([]);
  const [selection, setSelection] = useState<string | null>(TEXT);
  const [panel, setPanel] = useState<Panel>('text');
  /** A pick on the stage opens the controls for what was picked. */
  const select = (next: string | null) => {
    setSelection(next);
    if (next === TEXT) return setPanel('text');
    const el = elements.find((e) => e.uid === next);
    if (el) setPanel(el.kind === 'icon' ? 'icons' : 'emojis');
  };
  const [snapped, setSnapped] = useState<{ x: boolean; y: boolean } | null>(null);
  const fontReady = useFontReady(font.family);
  const [boxRef, boxWidth] = useBoxWidth(320);
  const stageRef = useRef<Konva.Stage>(null);
  const contentRef = useRef<Konva.Layer>(null);
  const textRef = useRef<Konva.Text>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const elementNodes = useRef(new Map<string, Konva.Image>());
  const imageOf = useElementImages(elements, textColor);

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
  const selectedElement = elements.find((el) => el.uid === selection) ?? null;
  const allImagesIn = elements.every((el) => imageOf(el) !== null);
  const imagesKey = elements.map((el) => (imageOf(el) ? el.uid : '')).join(',');
  const suggestedTitle = linesKey
    ? linesKey.replace(/\n/g, ' ')
    : elements.map((el) => el.label).join(' ');

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
    const node =
      selection === TEXT
        ? linesKey
          ? textRef.current
          : null
        : selection
          ? (elementNodes.current.get(selection) ?? null)
          : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selection, linesKey, fontSize, textX, textY, elements, imagesKey]);

  useEffect(() => {
    if (!fontReady || (!linesKey && elements.length === 0) || !allImagesIn) {
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
          onDraft({ blob, suggestedTitle, source: 'badge' });
        })
        .catch(() => !cancelled && onDraft(null));
    }, EXPORT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    fontReady,
    linesKey,
    shape,
    background,
    backgroundImage,
    textColor,
    outlineOn,
    outlineColor,
    scale,
    placement,
    elements,
    allImagesIn,
    imagesKey,
    suggestedTitle,
    onDraft,
  ]);

  const moveBy = (x: number, y: number) =>
    setPlacement((p) => ({
      ...p,
      dx: clamp(p.dx + x, BADGE_PAD - centerX, BADGE_PAD + geometry.width - centerX),
      dy: clamp(p.dy + y, BADGE_PAD - centerY, BADGE_PAD + geometry.height - centerY),
    }));
  const resizeTo = (next: number) => setPlacement((p) => ({ ...p, scale: clampScale(next) }));

  const clampX = (x: number) => clamp(x, 0, designW);
  const clampY = (y: number) => clamp(y, 0, designH);
  const changeElement = (
    uid: string,
    patch: Partial<Pick<PlacedElement, 'x' | 'y' | 'size' | 'rotation'>>
  ) => setElements((list) => list.map((el) => (el.uid === uid ? { ...el, ...patch } : el)));
  const removeElement = (uid: string) => {
    setElements((list) => list.filter((el) => el.uid !== uid));
    setSelection(null);
  };

  const addElement = (pick: StickerElementPick) => {
    const uid = `el-${++nextUid}`;
    // Each new one lands a little further along, so a second tap does not hide the first.
    const step = (elements.length % 5) * 40;
    setElements((list) => [
      ...list,
      {
        ...pick,
        uid,
        x: clampX(designW * 0.72 + step),
        y: clampY(designH * 0.24 + step),
        size: Math.round(Math.min(designW, designH) * 0.24),
        rotation: 0,
      },
    ]);
    setSelection(uid);
  };

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
    if (e.target === textRef.current) return select(TEXT);
    const hit = elements.find((el) => elementNodes.current.get(el.uid) === e.target);
    select(hit ? hit.uid : null);
  };

  const onKey = (e: KeyboardEvent) => {
    const arrow = ARROWS[e.key];
    const el = selectedElement;
    if (arrow) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_FAST : NUDGE;
      if (el)
        changeElement(el.uid, {
          x: clampX(el.x + arrow[0] * step),
          y: clampY(el.y + arrow[1] * step),
        });
      else moveBy(arrow[0] * step, arrow[1] * step);
    } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const grow = e.key === '+' || e.key === '=';
      if (el)
        changeElement(el.uid, {
          size: clamp(el.size * (grow ? 1.1 : 1 / 1.1), MIN_ELEMENT, Math.max(designW, designH)),
        });
      else resizeTo(placement.scale + (grow ? 1 : -1) * TEXT_SCALE.step * 2);
    } else if (el && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      changeElement(el.uid, { rotation: el.rotation + (e.key === ']' ? 1 : -1) * ROTATE_STEP });
    } else if (el && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      removeElement(el.uid);
    } else if (e.key === 'Escape') {
      setSelection(null);
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
      aria-label={`Vorschau: ${shapeLabel}${lines.length ? ` mit „${lines.join(' ')}“` : ''}${
        elements.length ? `, ${elements.map((el) => el.label).join(', ')}` : ''
      }`}
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
              fillPriority={backgroundImage ? 'pattern' : 'color'}
              {...(backgroundImage ? coverPattern(backgroundImage, geometry) : {})}
              stroke={outlineColor}
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
                select(TEXT);
                setCursor('grabbing');
              }}
              onDragMove={onDragMove}
              onDragEnd={(e) => {
                setCursor('grab');
                onDragEnd(e);
              }}
              onTransformEnd={onTransformEnd}
            />
            {elements.map((el) => {
              const image = imageOf(el);
              if (!image) return null;
              const w = el.size * (image.width / Math.max(1, image.height));
              return (
                <KonvaImage
                  key={el.uid}
                  ref={(node) => {
                    if (node) elementNodes.current.set(el.uid, node);
                    else elementNodes.current.delete(el.uid);
                  }}
                  image={image}
                  x={el.x}
                  y={el.y}
                  width={w}
                  height={el.size}
                  offsetX={w / 2}
                  offsetY={el.size / 2}
                  rotation={el.rotation}
                  draggable
                  onMouseEnter={() => setCursor('grab')}
                  onMouseLeave={() => setCursor('')}
                  onDragStart={() => {
                    select(el.uid);
                    setCursor('grabbing');
                  }}
                  onDragMove={(e) =>
                    e.target.position({ x: clampX(e.target.x()), y: clampY(e.target.y()) })
                  }
                  onDragEnd={(e) => {
                    setCursor('grab');
                    changeElement(el.uid, { x: e.target.x(), y: e.target.y() });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const size = Math.max(MIN_ELEMENT, el.size * node.scaleY());
                    node.scale({ x: 1, y: 1 });
                    changeElement(el.uid, {
                      x: node.x(),
                      y: node.y(),
                      size,
                      rotation: node.rotation(),
                    });
                  }}
                />
              );
            })}
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
              rotateEnabled={selection !== TEXT}
              rotationSnaps={[0, 90, 180, 270]}
              rotateAnchorOffset={24}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              anchorStroke={GUIDE_CASING}
              anchorFill="#fff"
              anchorSize={12}
              anchorCornerRadius={6}
              anchorStrokeWidth={1.5}
              borderStroke={GUIDE_COLOR}
              borderStrokeWidth={1.5}
              boundBoxFunc={(oldBox, newBox) => {
                if (selection !== TEXT)
                  return Math.abs(newBox.width) < MIN_ELEMENT * scale ||
                    Math.abs(newBox.height) < MIN_ELEMENT * scale
                    ? oldBox
                    : newBox;
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

  const tab = 'flex flex-col gap-lg pt-md';
  const controls = (
    <div className="flex flex-col">
      {/* Derselbe Umschalter wie „Bild | Text-Badge“ in der Kopfzeile. */}
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Bereich"
        value={panel}
        onValueChange={(v) => {
          if (v) setPanel(v as Panel);
        }}
        className="w-full"
      >
        {PANELS.map((p) => (
          <ToggleGroupItem key={p.id} value={p.id} className="h-9 flex-1 px-1 text-[13px]">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {panel === 'text' ? (
        <div className={tab}>
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
        </div>
      ) : null}
      {panel === 'form' ? (
        <div className={tab}>
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
          <SwitchRow label="Kontur" checked={outlineOn} onChange={setOutlineOn}>
            <SwatchPicker
              label="Farbe der Kontur"
              swatches={palette}
              value={outlineColor}
              onChange={setOutlineColor}
            />
          </SwitchRow>
        </div>
      ) : null}
      {panel === 'farben' ? (
        <div className={tab}>
          <div className="flex flex-col gap-sm">
            <SwatchPicker
              label="Hintergrund"
              swatches={palette}
              value={backgroundImage ? '' : background}
              onChange={(color) => {
                setBackground(color);
                setBackgroundImage(null);
              }}
              disabledColor={textColor}
            />
            <BackgroundImageButton image={backgroundImage} onChange={setBackgroundImage} />
          </div>
          <SwatchPicker
            label="Schrift"
            swatches={palette}
            value={textColor}
            onChange={setTextColor}
            disabledColor={backgroundImage ? null : background}
          />
        </div>
      ) : null}
      {panel === 'emojis' ? (
        <div className={tab}>
          <div className="flex flex-col gap-sm">
            <StickerElementPicker kind="emoji" onPick={addElement} />
            {selectedElement ? (
              <div className="flex flex-wrap items-center justify-between gap-sm rounded-lg bg-background-alt px-sm py-xs">
                <span className="min-w-0 truncate text-sm">{selectedElement.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => removeElement(selectedElement.uid)}
                >
                  Entfernen
                </Button>
              </div>
            ) : elements.length ? (
              <p className={cn(TOOL_HINT, 'text-xs')}>
                Tippe ein Emoji oder Icon auf dem Bild an, um es zu verschieben, zu drehen oder zu
                entfernen.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {panel === 'icons' ? (
        <div className={tab}>
          <div className="flex flex-col gap-sm">
            <StickerElementPicker kind="icon" onPick={addElement} />
            {selectedElement ? (
              <div className="flex flex-wrap items-center justify-between gap-sm rounded-lg bg-background-alt px-sm py-xs">
                <span className="min-w-0 truncate text-sm">{selectedElement.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => removeElement(selectedElement.uid)}
                >
                  Entfernen
                </Button>
              </div>
            ) : elements.length ? (
              <p className={cn(TOOL_HINT, 'text-xs')}>
                Tippe ein Emoji oder Icon auf dem Bild an, um es zu verschieben, zu drehen oder zu
                entfernen.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {children({ stage, controls })}
      <p id={hintId} className="sr-only">
        Pfeiltasten verschieben den Text oder das gewählte Emoji, Umschalt mit Pfeiltaste in großen
        Schritten, + und – ändern die Größe, eckige Klammern drehen, Entf löscht ein Emoji oder
        Icon.
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

/** Fills the shape like CSS `cover`: the picture scaled to cover it, centred. */
function coverPattern(image: HTMLImageElement, geometry: { width: number; height: number }) {
  const k = Math.max(geometry.width / image.width, geometry.height / image.height);
  return {
    fillPatternImage: image,
    fillPatternRepeat: 'no-repeat',
    fillPatternScaleX: k,
    fillPatternScaleY: k,
    fillPatternX: (geometry.width - image.width * k) / 2,
    fillPatternY: (geometry.height - image.height * k) / 2,
  };
}

function BackgroundImageButton({
  image,
  onChange,
}: {
  image: HTMLImageElement | null;
  onChange: (image: HTMLImageElement | null) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const pick = (file: File) => {
    setError(false);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => onChange(img);
      img.onerror = () => setError(true);
      img.src = String(reader.result);
    };
    reader.onerror = () => setError(true);
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-wrap items-center gap-sm">
      <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
        {image ? 'Anderes Bild' : 'Bild als Hintergrund'}
      </Button>
      {image ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
          Bild entfernen
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-sm text-error">
          Das Bild konnte nicht gelesen werden.
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Hintergrundbild wählen"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) pick(file);
        }}
      />
    </div>
  );
}
