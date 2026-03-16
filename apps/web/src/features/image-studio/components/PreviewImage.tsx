import { useState, useMemo } from 'react';

import { cn } from '../../../utils/cn';
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
  const [loaded, setLoaded] = useState(false);
  const lqip = useMemo(() => getLqip(src, fallbackSrc), [src, fallbackSrc]);
  const isWebp = src.endsWith('.webp');

  return (
    <div
      className="relative overflow-hidden w-full h-full"
      style={
        lqip
          ? {
              backgroundImage: `url(${lqip})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {isWebp && fallbackSrc ? (
        <picture
          className={cn(
            'block w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        >
          <source srcSet={src} type="image/webp" />
          <img
            src={fallbackSrc}
            alt={alt}
            className={className}
            loading="lazy"
            width={width}
            height={height}
            onLoad={() => setLoaded(true)}
          />
        </picture>
      ) : (
        <img
          src={src}
          alt={alt}
          className={cn(
            'block w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            className
          )}
          loading="lazy"
          width={width}
          height={height}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
};

export default PreviewImage;
