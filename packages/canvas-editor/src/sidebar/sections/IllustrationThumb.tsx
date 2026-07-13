import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { getIllustrationPath, getIllustrationThumbPath } from '../../utils/illustrations/registry';

import type { SvgDef } from '../../utils/illustrations/types';

/** Illustration thumbnail that falls back to the full SVG when no pre-rendered thumb exists. */
export function IllustrationThumb({
  def,
  alt,
  className,
}: {
  def: SvgDef;
  alt?: string;
  className?: string;
}) {
  const { assetBaseUrl = '' } = useCanvasEditorServices();
  return (
    <img
      src={getIllustrationThumbPath(def, assetBaseUrl)}
      alt={alt ?? def.name}
      className={className}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = '1';
          img.src = getIllustrationPath(def, assetBaseUrl);
        }
      }}
    />
  );
}
