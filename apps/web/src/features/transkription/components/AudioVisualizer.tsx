import { cn } from '@/utils/cn';

const BAR_COUNT = 7;

const BAR_ANIMATIONS = [
  'animate-[equalizer_1.2s_ease-in-out_infinite]',
  'animate-[equalizer_1.0s_ease-in-out_0.1s_infinite]',
  'animate-[equalizer_0.9s_ease-in-out_0.2s_infinite]',
  'animate-[equalizer_1.1s_ease-in-out_0.05s_infinite]',
  'animate-[equalizer_0.85s_ease-in-out_0.15s_infinite]',
  'animate-[equalizer_1.15s_ease-in-out_0.25s_infinite]',
  'animate-[equalizer_0.95s_ease-in-out_0.3s_infinite]',
];

interface AudioVisualizerProps {
  className?: string;
}

export default function AudioVisualizer({ className }: AudioVisualizerProps) {
  return (
    <div
      className={cn('flex items-end justify-center gap-[3px]', className)}
      role="img"
      aria-label="Audio wird transkribiert"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className={cn('w-[4px] rounded-full bg-primary-500 origin-bottom', BAR_ANIMATIONS[i])}
          style={{ height: '32px' }}
        />
      ))}
    </div>
  );
}
