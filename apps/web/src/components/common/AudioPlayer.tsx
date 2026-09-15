import { cn } from '@/utils/cn';

interface AudioPlayerProps {
  src: string;
  /** Accessible name — what the recording is, e.g. its title. */
  title: string;
  className?: string;
}

/**
 * The native player, full width. Generated speech and Mediathek audio both
 * go through here so seeking, volume and keyboard control come from the
 * browser rather than from us.
 */
export default function AudioPlayer({ src, title, className }: AudioPlayerProps) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- the audio IS the spoken form of a text the person has in front of them
    <audio
      controls
      preload="metadata"
      src={src}
      aria-label={title}
      className={cn('w-full rounded-lg', className)}
    />
  );
}
