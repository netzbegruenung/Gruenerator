/**
 * Vorschau eines Folienlayouts als SVG, gezeichnet aus demselben Zustand, den
 * die Seite bekommt: Fläche oder Foto, Formen, Grafiken, Diagramme schematisch
 * und die Texte in ihrer Schrift (umbrochen nach geschätzter Zeichenbreite).
 * Kein Konva, kein Offscreen-Render — der Picker zeigt sechzehn davon.
 */
import { memo, type ReactNode } from 'react';

import { ASSET_TARGET_SIZE, resolveAssetInstanceSrc } from '../utils/canvasAssets';

import type { SlideLayoutState } from './slideLayouts';
import type { AdditionalText } from '../configs/types';
import type { ChartInstance } from '../utils/chartUtils';

const W = 1920;
const H = 1080;
/** Mittlere Zeichenbreite als Anteil der Schriftgröße; reicht für eine Vorschau. */
const CHAR_WIDTH = 0.48;
const MAX_LINES = 14;

function wrap(value: string, width: number, size: number): string[] {
  const perLine = Math.max(4, Math.floor(width / (size * CHAR_WIDTH)));
  const lines: string[] = [];
  for (const paragraph of value.replace(/\*\*|==|\+\+/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (line && line.length + 1 + word.length > perLine) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
  }
  return lines.slice(0, MAX_LINES);
}

function TextShape({ text }: { text: AdditionalText }) {
  const lineHeight = (text.lineHeight ?? 1.2) * text.fontSize;
  const anchor = text.align === 'center' ? 'middle' : text.align === 'right' ? 'end' : 'start';
  const x =
    text.align === 'center'
      ? text.x + text.width / 2
      : text.align === 'right'
        ? text.x + text.width
        : text.x;
  return (
    <text
      x={x}
      y={text.y}
      fontFamily={text.fontFamily}
      fontSize={text.fontSize}
      fill={text.fill}
      textAnchor={anchor}
      {...(text.stroke ? { stroke: text.stroke, strokeWidth: text.strokeWidth ?? 1 } : {})}
    >
      {wrap(text.text, text.width, text.fontSize).map((line, i) => (
        // Zeilen haben keine eigene Identität; die Liste ist statisch.
        // eslint-disable-next-line react/no-array-index-key
        <tspan key={i} x={x} y={text.y + text.fontSize * 0.85 + i * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ChartShape({ chart }: { chart: ChartInstance }) {
  const w = chart.width * chart.scale;
  const h = chart.height * chart.scale;
  const color = (i: number) => chart.colors[i % chart.colors.length] ?? '#888888';
  if (chart.chartType === 'pie' || chart.chartType === 'donut') {
    const r = Math.min(w * 0.6, h) / 2 - 10;
    const cx = chart.x + r + 10;
    const cy = chart.y + h / 2;
    const total = chart.data.reduce((sum, d) => sum + d.value, 0) || 1;
    const point = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    const slices = chart.data.map((d, i) => {
      const start =
        -Math.PI / 2 +
        (chart.data.slice(0, i).reduce((sum, p) => sum + p.value, 0) / total) * Math.PI * 2;
      const end = start + (d.value / total) * Math.PI * 2;
      const large = end - start > Math.PI ? 1 : 0;
      return {
        key: d.name,
        d: `M${cx},${cy} L${point(start)} A${r},${r} 0 ${large} 1 ${point(end)} Z`,
        fill: color(i),
      };
    });
    return (
      <g>
        {slices.map((slice) => (
          <path key={slice.key} d={slice.d} fill={slice.fill} />
        ))}
      </g>
    );
  }
  const max = Math.max(...chart.data.map((d) => d.value), 1);
  const slot = w / chart.data.length;
  return (
    <g>
      {chart.data.map((d, i) => {
        const barH = (d.value / max) * (h - 40);
        return (
          <rect
            key={d.name}
            x={chart.x + i * slot + slot * 0.2}
            y={chart.y + h - barH}
            width={slot * 0.6}
            height={barH}
            fill={color(i)}
          />
        );
      })}
    </g>
  );
}

function elementsOf(state: SlideLayoutState): ReactNode[] {
  const byId = new Map<string, ReactNode>();
  for (const text of state.additionalTexts)
    byId.set(text.id, <TextShape key={text.id} text={text} />);
  for (const shape of state.shapeInstances) {
    byId.set(
      shape.id,
      shape.type === 'circle' ? (
        <ellipse
          key={shape.id}
          cx={shape.x}
          cy={shape.y}
          rx={shape.width / 2}
          ry={shape.height / 2}
          fill={shape.fill}
          opacity={shape.opacity}
        />
      ) : (
        <rect
          key={shape.id}
          x={shape.x - shape.width / 2}
          y={shape.y - shape.height / 2}
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          opacity={shape.opacity}
        />
      )
    );
  }
  for (const asset of state.assetInstances) {
    const src = resolveAssetInstanceSrc(asset);
    const size = ASSET_TARGET_SIZE * asset.scale;
    if (src) {
      byId.set(
        asset.id,
        <image
          key={asset.id}
          href={src}
          x={asset.x - size / 2}
          y={asset.y - size / 2}
          width={size}
          height={size}
          opacity={asset.opacity}
        />
      );
    }
  }
  for (const chart of state.chartInstances)
    byId.set(chart.id, <ChartShape key={chart.id} chart={chart} />);
  return state.layerOrder.flatMap((id) => byId.get(id) ?? []);
}

export const SlideLayoutThumbnail = memo(function SlideLayoutThumbnail({
  state,
}: {
  state: SlideLayoutState;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full h-auto"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={W} height={H} fill={state.backgroundColor} />
      {state.backgroundMode === 'image' && state.currentImageSrc ? (
        <image
          href={state.currentImageSrc}
          width={W}
          height={H}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : null}
      {elementsOf(state)}
    </svg>
  );
});
