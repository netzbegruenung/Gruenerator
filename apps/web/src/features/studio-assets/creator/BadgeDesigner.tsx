import { COLOR_SWATCHES_AT, COLOR_SWATCHES_DE } from '@gruenerator/shared/profilbild';
import { Label, Textarea } from '@gruenerator/ui';
import { type Stage as KonvaStage } from 'konva/lib/Stage';
import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { Layer, Path, Stage, Text } from 'react-konva';

import { TOOL_HINT, TOOL_LABEL, TOOL_PILL } from '../../studio-tools/components/ToolUi';

import {
  BADGE_MAX_LINES,
  BADGE_SHAPES,
  badgeGeometry,
  badgeLines,
  fitFontSize,
  type BadgeShapeId,
} from './badgeShapes';
import {
  DesignLayout,
  PreviewFrame,
  solidSwatches,
  SwatchPicker,
  SwitchRow,
  type StickerDraft,
} from './creatorParts';
import { STICKER_MAX_SIDE } from './stickerEffects';

import { cn } from '@/utils/cn';

/** Headline faces of the sharepic brand themes (packages/canvas-editor/src/brand/theme.ts). */
const BADGE_FONT = {
  'de-DE': { family: 'GrueneTypeNeue', lineHeight: 1 },
  'de-AT': { family: 'GothamNarrow-Ultra', lineHeight: 0.9 },
} as const;

/** DE: Sonne auf Tanne; AT: Weiß auf Magenta, the CI's Störer colour. */
const DEFAULT_COLORS = {
  'de-DE': { background: 'tanne', text: 'sonne' },
  'de-AT': { background: 'magenta', text: 'weiss' },
} as const;

const OUTLINE = 20;
const PAD = OUTLINE + 4;
const OUTLINE_COLOR = '#ffffff';
const TEXT_MAX = 60;
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
  const palette = solidSwatches(locale === 'de-AT' ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE);
  const colorOf = (id: string) => palette.find((s) => s.id === id)?.color ?? '#ffffff';
  const font = BADGE_FONT[locale];

  const [text, setText] = useState('Jetzt\nGrün wählen!');
  const [shape, setShape] = useState<BadgeShapeId>('stoerer');
  const [background, setBackground] = useState(() => colorOf(DEFAULT_COLORS[locale].background));
  const [textColor, setTextColor] = useState(() => colorOf(DEFAULT_COLORS[locale].text));
  const [outlineOn, setOutlineOn] = useState(true);
  const fontReady = useFontReady(font.family);
  const [boxRef, boxWidth] = useBoxWidth(320);
  const stageRef = useRef<KonvaStage>(null);

  const geometry = badgeGeometry(shape);
  const lines = badgeLines(text);
  const designW = geometry.width + 2 * PAD;
  const designH = geometry.height + 2 * PAD;
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
          onDraft({
            blob,
            width: Math.round((designW / designLong) * STICKER_MAX_SIDE),
            height: Math.round((designH / designLong) * STICKER_MAX_SIDE),
            suggestedTitle: linesKey.replace(/\n/g, ' '),
          });
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
    textColor,
    outlineOn,
    scale,
    designW,
    designH,
    designLong,
    onDraft,
  ]);

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
                  x={PAD}
                  y={PAD}
                  data={geometry.path}
                  fill={background}
                  stroke={OUTLINE_COLOR}
                  strokeEnabled={outlineOn}
                  strokeWidth={OUTLINE * 2}
                  lineJoin="round"
                  fillAfterStrokeEnabled
                />
                <Text
                  key={fontReady ? 'font' : 'fallback'}
                  x={PAD + geometry.textBox.x}
                  y={PAD + geometry.textBox.y}
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
          maxLength={TEXT_MAX}
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
      />
      <SwatchPicker label="Schrift" swatches={palette} value={textColor} onChange={setTextColor} />
      <SwitchRow label="Weiße Kontur" checked={outlineOn} onChange={setOutlineOn} />
    </DesignLayout>
  );
}
