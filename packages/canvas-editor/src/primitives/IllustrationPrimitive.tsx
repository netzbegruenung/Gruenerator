import { useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import { useCanvasEditorServices } from '../CanvasEditorProvider';
import { getIllustrationPath, findIllustrationById } from '../utils/illustrations/registry';
import { getCachedSVG, getSVG } from '../utils/illustrations/svgCache';
import { touchAnchorStyleFunc } from '../utils/touchInput';

import type {
  IllustrationInstance,
  KawaiiIllustrationType,
  SvgDef,
  KawaiiInstance,
} from '../utils/illustrations/types';
import type { SnapTarget } from '../utils/snapping';
import type Konva from 'konva';

// react-kawaii and react-dom/server are only needed once a kawaii
// illustration is on the canvas, so they load on demand (like recharts in
// ChartPrimitive) instead of riding in the editor-core chunk.
async function renderKawaiiSvg(instance: KawaiiInstance, size: number): Promise<string | null> {
  const [{ renderToStaticMarkup }, kawaii] = await Promise.all([
    import('react-dom/server'),
    import('react-kawaii'),
  ]);
  const components: Record<KawaiiIllustrationType, typeof kawaii.Planet> = {
    planet: kawaii.Planet,
    cat: kawaii.Cat,
    ghost: kawaii.Ghost,
    iceCream: kawaii.IceCream,
    browser: kawaii.Browser,
    mug: kawaii.Mug,
    speechBubble: kawaii.SpeechBubble,
    backpack: kawaii.Backpack,
    creditCard: kawaii.CreditCard,
    file: kawaii.File,
    folder: kawaii.Folder,
  };
  const Component = components[instance.illustrationId];
  if (!Component) return null;
  return renderToStaticMarkup(
    <Component size={size} mood={instance.mood} color={instance.color} />
  );
}

export interface IllustrationPrimitiveProps {
  illustration: IllustrationInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  onSnapChange?: (h: boolean, v: boolean) => void;
  onSnapLinesChange?: (lines: unknown[]) => void;
  getSnapTargets?: (id: string) => SnapTarget[];
  stageWidth?: number;
  stageHeight?: number;
  draggable?: boolean;
}

function IllustrationPrimitiveInner({
  illustration,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  draggable = true,
}: IllustrationPrimitiveProps) {
  const { assetBaseUrl = '' } = useCanvasEditorServices();
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  // Load Image (Kawaii or SVG)
  useEffect(() => {
    let cancelled = false;
    if (illustration.source === 'kawaii') {
      const size = 200; // Render at high resolution
      void renderKawaiiSvg(illustration as KawaiiInstance, size).then((svgString) => {
        if (cancelled || !svgString) return;
        const encoded = encodeURIComponent(svgString);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;

        const img = new window.Image();
        img.src = dataUrl;
        img.onload = () => setImage(img);
      });
    } else {
      // Load SVG from cache or fetch if not cached
      const loadSvg = async () => {
        const def = await findIllustrationById(illustration.illustrationId);
        if (!def || def.source === 'kawaii') return;

        const svgDef = def as SvgDef;

        // Try cache first (synchronous, instant)
        const cached = getCachedSVG(svgDef.id, illustration.color);
        if (cached) {
          const img = new window.Image();
          img.src = cached;
          img.onload = () => setImage(img);
          return;
        }

        // Fallback: fetch and cache (async)
        try {
          const dataUrl = await getSVG(svgDef.id, svgDef, illustration.color, assetBaseUrl);
          const img = new window.Image();
          img.src = dataUrl;
          img.onload = () => setImage(img);
        } catch (err) {
          console.error('Failed to load SVG:', err);
          // Final fallback: direct load without color manipulation
          const path = getIllustrationPath(svgDef, assetBaseUrl);
          const img = new window.Image();
          img.src = path;
          img.onload = () => setImage(img);
        }
      };

      void loadSvg();
    }
    return () => {
      cancelled = true;
    };
  }, [
    illustration.source,
    illustration.illustrationId,
    illustration.color, // Depend on color
    assetBaseUrl,
    // Only Kawaii specific props trigger re-render of SVG
    illustration.source === 'kawaii' ? (illustration as KawaiiInstance).mood : null,
    illustration.source === 'kawaii' ? (illustration as KawaiiInstance).color : null,
  ]);

  // Transformer logic
  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  const BASE_SIZE = 200;
  const TARGET_SIZE = 160;
  const baseScale = TARGET_SIZE / BASE_SIZE;

  return (
    <>
      <Group
        ref={groupRef}
        x={illustration.x}
        y={illustration.y}
        scaleX={illustration.scale * baseScale}
        scaleY={illustration.scale * baseScale}
        rotation={illustration.rotation}
        opacity={illustration.opacity}
        draggable={draggable}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect(illustration.id);
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onSelect(illustration.id);
        }}
        onDragEnd={(e) => {
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newScale = Math.max(scaleX, scaleY) / baseScale;
          const newRotation = node.rotation();

          // Reset node transform
          node.scaleX(illustration.scale * baseScale);
          node.scaleY(illustration.scale * baseScale);
          node.rotation(illustration.rotation);

          onTransformEnd(node.x(), node.y(), newScale, newRotation);
        }}
      >
        <Image
          image={image}
          width={BASE_SIZE}
          height={BASE_SIZE}
          offsetX={BASE_SIZE / 2}
          offsetY={BASE_SIZE / 2}
        />

        {/* Selection border */}
        {isSelected && (
          <Rect
            name="selection-chrome"
            x={-BASE_SIZE / 2}
            y={-BASE_SIZE / 2}
            width={BASE_SIZE}
            height={BASE_SIZE}
            stroke="#005437"
            strokeWidth={2 / (illustration.scale * baseScale)}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
          anchorStyleFunc={touchAnchorStyleFunc}
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
        />
      )}
    </>
  );
}

/**
 * Memoized IllustrationPrimitive - Prevents unnecessary re-renders during drag
 */
export const IllustrationPrimitive = memo(IllustrationPrimitiveInner, (prevProps, nextProps) => {
  // Compare illustration object properties
  const prev = prevProps.illustration;
  const next = nextProps.illustration;

  if (prev.id !== next.id) return false;
  if (prev.source !== next.source) return false;
  if (prev.illustrationId !== next.illustrationId) return false;
  if (prev.x !== next.x) return false;
  if (prev.y !== next.y) return false;
  if (prev.scale !== next.scale) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.opacity !== next.opacity) return false;
  if (prev.color !== next.color) return false;

  // Compare other props
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;

  // Callbacks are considered stable
  return true;
});

IllustrationPrimitive.displayName = 'IllustrationPrimitive';
