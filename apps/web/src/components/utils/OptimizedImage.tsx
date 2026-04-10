// @ts-expect-error — no type declarations available; module typed in vite-env.d.ts but CI tsconfig doesn't include it
import { LazyLoadImage } from 'react-lazy-load-image-component';
// @ts-expect-error — CSS import for blur effect
import 'react-lazy-load-image-component/src/effects/blur.css';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  effect?: 'blur' | 'black-and-white' | 'opacity';
  placeholderSrc?: string;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  [key: string]: unknown;
}

const OptimizedImage = ({
  src,
  alt,
  className,
  width,
  height,
  effect = 'blur',
  placeholderSrc = '/assets/images/placeholder-image.svg',
  onError,
  onLoad,
  ...props
}: OptimizedImageProps) => {
  return (
    <LazyLoadImage
      src={src}
      alt={alt}
      className={className}
      effect={effect}
      width={width}
      height={height}
      placeholderSrc={placeholderSrc}
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  );
};

export default OptimizedImage;
