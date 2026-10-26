import { useLayoutEffect, useRef } from 'react';

import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider';
import { paintCropGhosts } from '../utils/cropGhost';

import type Konva from 'konva';

/**
 * Das Restbild im Zuschneide-Modus jenseits der Seite. Die Konva-Bühne ist so
 * groß wie die Seite und schneidet alles darüber hinaus ab; diese DOM-Fläche
 * liegt im Bühnen-Container, zeichnet nach jedem Konva-Frame die Restbild-
 * Knoten (`CROP_GHOST_NAME`) nach und folgt damit Ziehen und Zoomen ohne
 * React-Zustand. Exporte rendern nur die Bühne und sehen sie nie.
 */
export function CropGhostOverlay({ getStage }: { getStage: () => Konva.Stage | null }) {
  const active = useCanvasStoreSelector((s) => s.croppingElement !== null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const stage = getStage();
    const canvas = canvasRef.current;
    if (!active || !stage || !canvas) return;
    const paint = () => paintCropGhosts(stage, canvas);
    const layers = stage.getLayers();
    layers.forEach((layer) => layer.on('draw.cropGhost', paint));
    paint();
    return () => layers.forEach((layer) => layer.off('draw.cropGhost'));
  }, [active, getStage]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-crop-ghost-overlay=""
      // Über der Bühne, aber unter ihrem Rahmen (::after, z-index 10); die Seite selbst ist ausgespart.
      className="pointer-events-none absolute z-[5]"
      style={{ display: 'none' }}
    />
  );
}
