import { cn } from '../../utils/cn';

interface UnsplashAttributionProps {
  photographer: string;
  profileUrl: string;
  photoUrl?: string;
  compact?: boolean;
  className?: string;
}

const UnsplashAttribution = ({
  photographer,
  profileUrl,
  photoUrl,
  compact = false,
  className = '',
}: UnsplashAttributionProps) => {
  if (!photographer) return null;

  const linkClasses =
    'text-primary-500 no-underline transition-opacity duration-200 hover:opacity-80 hover:underline';

  if (compact) {
    return (
      <span className={cn('inline text-xs text-foreground opacity-70 leading-snug', className)}>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Foto von ${photographer} auf Unsplash`}
          className={linkClasses}
        >
          {photographer}
        </a>
      </span>
    );
  }

  return (
    <div
      className={cn(
        'text-xs text-foreground opacity-70 text-center px-xs py-xxs leading-snug',
        className
      )}
    >
      <span>Foto von </span>
      <a href={profileUrl} target="_blank" rel="noopener noreferrer" className={linkClasses}>
        {photographer}
      </a>
      <span> auf </span>
      <a
        href="https://unsplash.com"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClasses}
      >
        Unsplash
      </a>
    </div>
  );
};

export default UnsplashAttribution;
