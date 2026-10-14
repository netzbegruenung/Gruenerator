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
import { Label, Textarea } from '@gruenerator/ui';
import { type Stage as KonvaStage } from 'konva/lib/Stage';
import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { Layer, Path, Stage, Text } from 'react-konva';

import { TOOL_HINT, TOOL_LABEL, TOOL_PILL } from '../../studio-tools/components/ToolUi';

import {
  DesignLayout,
  PreviewFrame,
  SwatchPicker,
  SwitchRow,
  type StickerDraft,
} from './creatorParts';

import { cn } from '@/utils/cn';

/** Headline faces of the sharepic brand themes (packages/canvas-editor/src/brand/theme.ts). */
const BADGE_FONT = {
  'de-DE': { family: 'GrueneTypeNeue', lineHeight: BADGE_LINE_HEIGHT['de-DE'] },
  'de-AT': { family: 'GothamNarrow-Ultra', lineHeight: BADGE_LINE_HEIGHT['de-AT'] },
} as const;

const EXPORT_DELAY_MS = 250;

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
    if (!el) return;
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
}: {
  locale: 'de-DE' | 'de-AT';
  onDraft: (draft: StickerDraft | null) => void;
}): JSX.Element {
  const textId = useId();
  const shapeLabelId = useId();
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
  const fontReady = useFontReady(font.family);
  const [boxRef, boxWidth] = useBoxWidth(320);
  const stageRef = useRef<KonvaStage>(null);

  const geometry = badgeGeometry(shape);
  const lines = badgeLines(text);
  const designW = geometry.width + 2 * BADGE_PAD;
  const designH = geometry.height + 2 * BADGE_PAD;
  const designLong = Math.max(designW, designH);
  const scale = Math.min(boxWidth, 480) / designLong;
  const fontSize = fitFontSize(
    lines,
    geometry.textBox,
    (line) => measureLine(font.family, line),
    font.lineHeight
  );
  const tooManyLines = text.split('\n').filter((l) => l.trim()).length > BADGE_MAX_LINES;
  const linesKey = lines.join('\n');

  useEffect(() => {
    if (!fontReady || !linesKey) {
      onDraft(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const pixelRatio = STICKER_MAX_SIDE / Math.max(stage.width(), stage.height());
      void stage
        .toBlob({ pixelRatio, mimeType: 'image/png' })
        .then((blob) => {
          if (cancelled) return;
          onDraft({ blob, suggestedTitle: linesKey.replace(/\n/g, ' ') });
        })
        .catch(() => !cancelled && onDraft(null));
    }, EXPORT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fontReady, linesKey, shape, background, textColor, outlineOn, scale, onDraft]);

  return (
    <DesignLayout
      preview={
        <PreviewFrame>
          <div
            ref={boxRef}
            role="img"
            aria-label={`Vorschau: ${BADGE_SHAPES.find((s) => s.id === shape)?.label ?? ''}${
              lines.length ? ` mit „${lines.join(' ')}“` : ''
            }`}
            className="flex size-full items-center justify-center"
          >
            <Stage
              ref={stageRef}
              width={Math.round(designW * scale)}
              height={Math.round(designH * scale)}
              scaleX={scale}
              scaleY={scale}
            >
              <Layer>
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
                  key={fontReady ? 'font' : 'fallback'}
                  x={BADGE_PAD + geometry.textBox.x}
                  y={BADGE_PAD + geometry.textBox.y}
                  width={geometry.textBox.width}
                  height={geometry.textBox.height}
                  text={linesKey}
                  fontFamily={font.family}
                  fontSize={fontSize}
                  lineHeight={font.lineHeight}
                  fill={textColor}
                  align="center"
                  verticalAlign="middle"
                  wrap="none"
                />
              </Layer>
            </Stage>
          </div>
        </PreviewFrame>
      }
    >
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
            : 'Bis zu drei Zeilen – die Schrift passt sich der Form an.'}
        </p>
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
    </DesignLayout>
  );
}
