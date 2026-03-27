import { useState, useMemo } from 'react';

import { cn } from '../lib/cn';

export interface PreviewImageProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  placeholder?: string;
  className?: string;
  width?: number;
  height?: number;
}

export function PreviewImage({
  src,
  fallbackSrc,
  alt,
  placeholder,
  className,
  width,
  height,
}: PreviewImageProps) {
  const [loaded, setLoaded] = useState(false);
  const isWebp = useMemo(() => src.endsWith('.webp'), [src]);

  return (
    <div
      className="relative overflow-hidden w-full h-full"
      style={
        placeholder
          ? {
              backgroundImage: `url(${placeholder})`,
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
}
