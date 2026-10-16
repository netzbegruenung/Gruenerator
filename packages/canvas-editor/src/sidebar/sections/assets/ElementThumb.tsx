import { shareCanvasPreviewUrl, shareThumbnailPreviewUrl } from '@gruenerator/shared/media-library';
import { Icon } from '@iconify/react';

import { cn } from '../../../utils/cn';
import { SingleBalkenPreviewIcon, TripleBalkenPreviewIcon } from '../BadgePreviewIcons';
import { ChartTypePreview } from '../DiagrammeSection';
import { ALL_PALETTE_SHAPES, getShapeVariant } from '../FormenSection';
import { IllustrationThumb } from '../IllustrationThumb';
import { FramePresetPreview } from '../RahmenSection';

import { PREVIEW_COMPONENTS } from './constants';

import type { ElementThumbSpec } from './elementTypes';
import type { ShapeType } from '../../../utils/shapes';

const PALETTE_BY_TYPE = new Map(ALL_PALETTE_SHAPES.map((shape) => [shape.id, shape]));

/** Kawaii characters keep the brand tanne; the tile behind them stays light. */
const KAWAII_COLOR = '#005437';

/** A photo fills its tile edge to edge; every other preview sits centred inside it. */
export function thumbFillsTile(thumb: ElementThumbSpec): boolean {
  return thumb.t === 'photo';
}

/** Light-on-dark logos need the dark tile to stay visible. */
export function thumbNeedsDarkTile(thumb: ElementThumbSpec): boolean {
  return thumb.t === 'img' && thumb.inverse === true;
}

function ShapeThumb({ shapeType }: { shapeType: ShapeType }) {
  const shape = PALETTE_BY_TYPE.get(shapeType);
  if (!shape) return null;
  const variant = getShapeVariant(shapeType);
  return (
    // The palette glyphs are drawn at 32px; scaling is a transform, not a re-layout.
    <span
      className={cn(
        'inline-flex items-center justify-center scale-[1.45]',
        variant.darkPreviewClass
      )}
      style={{ color: variant.color }}
    >
      {shape.renderPreview()}
    </span>
  );
}

export function ElementThumb({
  thumb,
  eager = false,
}: {
  thumb: ElementThumbSpec;
  /** Above the fold (recent, brand): load at once instead of on scroll. */
  eager?: boolean;
}) {
  const loading = eager ? 'eager' : 'lazy';
  switch (thumb.t) {
    case 'img':
      return (
        <img
          src={thumb.src}
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      );
    case 'share':
      return (
        <img
          src={shareThumbnailPreviewUrl(thumb.src, 200)}
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      );
    case 'photo':
      return (
        <img
          src={shareCanvasPreviewUrl(thumb.src, 200)}
          srcSet={`${shareCanvasPreviewUrl(thumb.src, 200)} 200w, ${shareCanvasPreviewUrl(thumb.src, 400)} 400w`}
          sizes="(max-width: 899px) 33vw, 104px"
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover rounded-[inherit]"
        />
      );
    case 'shape':
      return <ShapeThumb shapeType={thumb.shapeType} />;
    case 'chart':
      return <ChartTypePreview type={thumb.chartType} size={64} />;
    case 'frame':
      return (
        <FramePresetPreview
          clipType={thumb.clipType}
          className="size-full text-editor-secondary-fg"
        />
      );
    case 'kawaii': {
      const Kawaii = PREVIEW_COMPONENTS[thumb.id];
      return <Kawaii size={52} mood="happy" color={KAWAII_COLOR} />;
    }
    case 'svg':
      return <IllustrationThumb def={thumb.def} alt="" className="size-full object-contain" />;
    case 'icon':
      return (
        <span className="inline-flex text-[var(--editor-text)]">
          <Icon icon={thumb.iconId} width={34} height={34} />
        </span>
      );
    case 'balken':
      return thumb.mode === 'single' ? (
        <SingleBalkenPreviewIcon size={60} />
      ) : (
        <TripleBalkenPreviewIcon size={60} />
      );
  }
}
