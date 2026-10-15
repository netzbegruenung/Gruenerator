/**
 * Beschnitt- und Schutzzonen-Hilfslinien für Druckformate: Beschnittkante
 * (Endformat) und Schutzzone als dünne gestrichelte Linien, der Beschnittstreifen
 * leicht abgedunkelt. Reines Editor-Chrome: die Gruppe heißt `selection-chrome`,
 * also blendet jeder Export (`withSelectionChromeHidden`) sie aus. Koordinaten
 * liegen im Format-Pixelraum der Bühne (Kind der Stage-Ebene, nach den Inhalten); `strokeScaleEnabled={false}` hält die
 * Linien bei jedem Zoom ~1 Bildschirm-Pixel dünn. Konva-Formen brauchen
 * konkrete Farben (wie `useHoverOutline`), keine `--editor-*` Tokens.
 */

import { Group, Line, Rect } from 'react-konva';

import { isPrintFormat, printGeometry, type CanvasFormat } from '../formats';

const TRIM_STROKE = '#e6007e';
const SAFE_STROKE = 'rgb(0, 161, 255)';
const BLEED_SHADE = 'rgba(0, 0, 0, 0.18)';

function rectPoints(r: { x: number; y: number; width: number; height: number }): number[] {
  return [r.x, r.y, r.x + r.width, r.y, r.x + r.width, r.y + r.height, r.x, r.y + r.height];
}

export function PrintGuides({ format }: { format: CanvasFormat }) {
  if (!isPrintFormat(format)) return null;
  const { trim, safe } = printGeometry(format);
  const { width, height } = format;
  const right = trim.x + trim.width;
  const bottom = trim.y + trim.height;

  return (
    <Group name="selection-chrome" listening={false}>
      <Rect name="bleed-shade" x={0} y={0} width={width} height={trim.y} fill={BLEED_SHADE} />
      <Rect
        name="bleed-shade"
        x={0}
        y={bottom}
        width={width}
        height={Math.max(0, height - bottom)}
        fill={BLEED_SHADE}
      />
      <Rect
        name="bleed-shade"
        x={0}
        y={trim.y}
        width={trim.x}
        height={trim.height}
        fill={BLEED_SHADE}
      />
      <Rect
        name="bleed-shade"
        x={right}
        y={trim.y}
        width={Math.max(0, width - right)}
        height={trim.height}
        fill={BLEED_SHADE}
      />
      <Line
        name="print-trim-line"
        points={rectPoints(trim)}
        closed
        stroke={TRIM_STROKE}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[6, 4]}
        listening={false}
      />
      <Line
        name="print-safe-line"
        points={rectPoints(safe)}
        closed
        stroke={SAFE_STROKE}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[2, 4]}
        listening={false}
      />
    </Group>
  );
}
