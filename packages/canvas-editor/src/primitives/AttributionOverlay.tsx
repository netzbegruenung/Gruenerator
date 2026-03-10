/**
 * AttributionOverlay - Konva primitive for rendering image attribution
 *
 * Renders photographer attribution on canvas exports to comply with
 * Unsplash API guidelines. Only visible during export phase.
 */

import { Group, Rect, Text } from 'react-konva';

import type { AttributionRenderData } from '../utils/attributionOverlay';

interface AttributionOverlayProps {
  data: AttributionRenderData | null;
}

export function AttributionOverlay({ data }: AttributionOverlayProps) {
  if (!data) return null;

  // Calculate actual dimensions for the background box
  const textWidth = data.text.length * data.fontSize * 0.6;
  const boxWidth = textWidth + data.padding * 2;
  const boxHeight = data.fontSize + data.padding * 2;

  return (
    <Group>
      {/* Semi-transparent background box */}
      <Rect
        x={data.x}
        y={data.y}
        width={boxWidth}
        height={boxHeight}
        fill={data.backgroundColor}
        cornerRadius={4}
      />

      {/* Attribution text */}
      <Text
        x={data.x + data.padding}
        y={data.y + data.padding}
        text={data.text}
        fontSize={data.fontSize}
        fontFamily="Arial, sans-serif"
        fill={data.textColor}
      />
    </Group>
  );
}
