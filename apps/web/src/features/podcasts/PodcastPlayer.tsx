import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { formatAudioDuration } from '@/utils/formatAudioDuration';

const SPEEDS = [0.8, 1, 1.25, 1.5] as const;
const SKIP_SECONDS = 15;

interface PodcastPlayerProps {
  src: string;
  /** Accessible name of the recording. */
  title: string;
  /** Known from the server, so the scrubber has a length before metadata loads. */
  durationSeconds: number | null;
}

const roundBtn =
  'inline-flex items-center justify-center rounded-full text-foreground transition-colors hover:bg-background-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-600';

/**
 * A podcast player: one big play button, ±15 s, a scrubber and the speed.
 * The `<audio>` element stays the source of truth — the controls only mirror
 * its state, so media keys and the lock-screen player keep working.
 */
export function PodcastPlayer({ src, title, durationSeconds }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const speedId = useId();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [speed, setSpeed] = useState<number>(1);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(seconds, 0), duration || audio.duration || 0);
    setTime(audio.currentTime);
  };

  const changeSpeed = (next: number) => {
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="rounded-xl bg-background-alt p-md sm:p-lg">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript is on the same page */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        aria-label={title}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = speed;
        }}
      />

      <div className="flex items-center justify-center gap-md">
        <button
          type="button"
          className={`${roundBtn} h-11 w-11`}
          onClick={() => seekTo(time - SKIP_SECONDS)}
          aria-label={`${SKIP_SECONDS} Sekunden zurück`}
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Abspielen'}
          className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary-600 text-white shadow-md transition-transform hover:-translate-y-px hover:bg-secondary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-600"
        >
          {playing ? (
            <Pause className="h-7 w-7" aria-hidden="true" />
          ) : (
            <Play className="ml-1 h-7 w-7" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={`${roundBtn} h-11 w-11`}
          onClick={() => seekTo(time + SKIP_SECONDS)}
          aria-label={`${SKIP_SECONDS} Sekunden vor`}
        >
          <RotateCw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-md">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={1}
          value={Math.min(time, duration || time)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Position"
          aria-valuetext={`${formatAudioDuration(time)} von ${formatAudioDuration(duration)}`}
          className="w-full cursor-pointer accent-secondary-600"
        />
        <div className="mt-xs flex items-center justify-between text-xs tabular-nums text-grey-500">
          <span>{formatAudioDuration(time)}</span>
          <div className="flex items-center gap-xs">
            <label htmlFor={speedId} className="sr-only">
              Geschwindigkeit
            </label>
            <select
              id={speedId}
              value={speed}
              onChange={(e) => changeSpeed(Number(e.target.value))}
              className="h-7 rounded-sm border-0 bg-background px-xs text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {String(s).replace('.', ',')}×
                </option>
              ))}
            </select>
          </div>
          <span>{formatAudioDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}
