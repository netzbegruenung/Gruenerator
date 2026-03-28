import * as React from 'react';

import { cn } from '../lib/cn';

type VideoCardAspect = '9/16' | 'square';

interface VideoCardProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  src: string;
  poster?: string;
  title?: string;
  duration?: number;
  footer?: React.ReactNode;
  overlay?: React.ReactNode;
  aspect?: VideoCardAspect;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const aspectClasses: Record<VideoCardAspect, string> = {
  '9/16': 'aspect-[9/16]',
  square: 'aspect-square',
};

function VideoCard({
  src,
  poster,
  title,
  duration,
  footer,
  overlay,
  aspect = '9/16',
  className,
  ...props
}: VideoCardProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const hoveringRef = React.useRef(false);

  const handleMouseEnter = React.useCallback(() => {
    hoveringRef.current = true;
    const video = videoRef.current;
    if (!video) return;

    if (!video.src || video.src === '') {
      video.src = src;
    }
    void video
      .play()
      .then(() => {
        if (hoveringRef.current) setPlaying(true);
      })
      .catch(() => {
        // play() rejected — user left before playback started
      });
  }, [src]);

  const handleMouseLeave = React.useCallback(() => {
    hoveringRef.current = false;
    setPlaying(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, []);

  return (
    <div
      data-slot="video-card"
      className={cn(
        'group relative flex flex-col rounded-lg overflow-hidden bg-black cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg',
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <div className={cn('relative overflow-hidden', aspectClasses[aspect])}>
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            playing ? 'opacity-100' : 'opacity-0'
          )}
          aria-label={title}
        />

        {poster ? (
          <img
            src={poster}
            alt={title || ''}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
              playing ? 'opacity-0' : 'opacity-100'
            )}
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center text-grey-500 text-3xl transition-opacity duration-300',
              playing ? 'opacity-0' : 'opacity-100'
            )}
          >
            ▶
          </div>
        )}

        {/* Gradient + text overlay — fades out when playing */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none',
            playing ? 'opacity-0' : 'opacity-100'
          )}
        >
          <div className="bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-3 pt-12">
            {title && (
              <p className="text-white text-sm font-semibold leading-snug line-clamp-2 m-0">
                {title}
              </p>
            )}
            {duration != null && duration > 0 && (
              <span className="text-white/70 text-xs mt-1 block">{formatDuration(duration)}</span>
            )}
          </div>
        </div>

        {overlay && <div className="absolute inset-0">{overlay}</div>}
      </div>

      {footer && (
        <div className="bg-background border-t border-grey-200 dark:border-grey-700 px-sm py-sm">
          {footer}
        </div>
      )}
    </div>
  );
}

export { VideoCard, type VideoCardProps, type VideoCardAspect };
