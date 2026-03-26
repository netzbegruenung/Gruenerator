import { PreviewImage as BasePreviewImage } from '@gruenerator/ui';
import { useMemo } from 'react';

import { lqipMap } from '../utils/lqipMap';

interface PreviewImageProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

function getLqip(src: string, fallbackSrc?: string): string | undefined {
  if (fallbackSrc && lqipMap[fallbackSrc]) return lqipMap[fallbackSrc];
  const pngPath = src.replace(/\.webp$/, '.png');
  if (lqipMap[pngPath]) return lqipMap[pngPath];
  const jpgPath = src.replace(/\.webp$/, '.jpg');
  if (lqipMap[jpgPath]) return lqipMap[jpgPath];
  return lqipMap[src];
}

const PreviewImage: React.FC<PreviewImageProps> = ({
  src,
  fallbackSrc,
  alt,
  className,
  width,
  height,
}) => {
  const placeholder = useMemo(() => getLqip(src, fallbackSrc), [src, fallbackSrc]);

  return (
    <BasePreviewImage
      src={src}
      fallbackSrc={fallbackSrc}
      alt={alt}
      placeholder={placeholder}
      className={className}
      width={width}
      height={height}
    />
  );
};

export default PreviewImage;
