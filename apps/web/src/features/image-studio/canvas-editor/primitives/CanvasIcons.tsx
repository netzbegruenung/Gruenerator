/**
 * CanvasIcons - Renders selected Phosphor icons on the Konva canvas
 */
import { useEffect, useState, useCallback } from 'react';
import useImage from 'use-image';

import { generateIconDataUrl } from '../utils/canvasIcons';

import { CanvasImage } from './CanvasImage';

interface IconPosition {
  x: number;
  y: number;
  size: number;
}

interface CanvasIconsProps {
  selectedIcons: string[];
  iconPositions: Record<string, IconPosition>;
  onPositionChange: (iconId: string, x: number, y: number) => void;
  onSizeChange: (iconId: string, size: number) => void;
  selectedElement: string | null;
  onSelect: (iconId: string) => void;
  stageWidth: number;
  stageHeight: number;
  iconColor?: string;
  defaultSize?: number;
}

// Single icon component that loads from data URL
function CanvasIcon({
  iconId,
  position,
  onDragEnd,
  onTransformEnd,
  selected,
  onSelect,
  stageWidth,
  stageHeight,
  color,
}: {
  iconId: string;
  position: IconPosition;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, w: number, h: number) => void;
  selected: boolean;
  onSelect: () => void;
  stageWidth: number;
  stageHeight: number;
  color: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  // Generate data URL for this icon
  useEffect(() => {
    const url = generateIconDataUrl(iconId, position.size * 2, color);
    setDataUrl(url);
  }, [iconId, position.size, color]);

  const [image] = useImage(dataUrl || '', 'anonymous');

  if (!dataUrl || !image) return null;

  return (
    <CanvasImage
      id={`icon-${iconId}`}
      image={image}
      x={position.x}
      y={position.y}
      width={position.size}
      height={position.size}
      draggable
      selected={selected}
      onSelect={onSelect}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      transformConfig={{ keepRatio: true, bounds: { minWidth: 24, maxWidth: 200 } }}
    />
  );
}

export function CanvasIcons({
  selectedIcons,
  iconPositions,
  onPositionChange,
  onSizeChange,
  selectedElement,
  onSelect,
  stageWidth,
  stageHeight,
  iconColor = '#ffffff',
  defaultSize = 64,
}: CanvasIconsProps) {
  // Calculate default positions for new icons (spread across bottom-right area)
  const getDefaultPosition = useCallback(
    (index: number): IconPosition => {
      const spacing = defaultSize + 20;
      const startX = stageWidth - defaultSize - 40;
      const startY = stageHeight - defaultSize - 40 - index * spacing;
      return {
        x: startX,
        y: Math.max(40, startY),
        size: defaultSize,
      };
    },
    [stageWidth, stageHeight, defaultSize]
  );

  return (
    <>
      {selectedIcons.map((iconId, index) => {
        const position = iconPositions[iconId] || getDefaultPosition(index);
        const isSelected = selectedElement === `icon-${iconId}`;

        return (
          <CanvasIcon
            key={iconId}
            iconId={iconId}
            position={position}
            onDragEnd={(x, y) => onPositionChange(iconId, x, y)}
            onTransformEnd={(_x, _y, w, _h) => onSizeChange(iconId, w)}
            selected={isSelected}
            onSelect={() => onSelect(iconId)}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            color={iconColor}
          />
        );
      })}
    </>
  );
}

export default CanvasIcons;
