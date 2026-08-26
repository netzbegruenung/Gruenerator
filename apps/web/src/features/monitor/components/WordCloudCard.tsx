import { cn } from '@gruenerator/ui';

import { MONITOR_CARD, MONITOR_HEADING, MONITOR_MUTED } from './theme';

export interface CloudWord {
  key: string;
  word: string;
  /** Normalized 0..1 — drives font size and colour tier. */
  weight: number;
  url?: string;
}

/** Size a word-cloud entry by its normalized weight (0..1). */
export function cloudEntry(weight: number): { style: { fontSize: string }; className: string } {
  const tier = weight >= 0.66 ? 2 : weight >= 0.33 ? 1 : 0;
  return {
    style: { fontSize: `${(0.82 + weight * 0.6).toFixed(2)}rem` },
    className:
      tier === 2
        ? 'font-bold text-[#316049] dark:text-[#6fae90]'
        : tier === 1
          ? 'font-semibold text-[#5c6b63] dark:text-grey-300'
          : 'font-semibold text-[#8b978f] dark:text-grey-500',
  };
}

/**
 * A titled word cloud. Shared by Themen (Top-Keywords) and Trends
 * (X/Twitter), which is why it lives here rather than in either page.
 */
export function WordCloudCard({
  title,
  subtitle,
  words,
}: {
  title: string;
  subtitle: string;
  words: CloudWord[];
}) {
  return (
    <div>
      <h2
        className={cn('m-0 mb-1 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}
      >
        {title}
      </h2>
      <p className={cn('m-0 mb-5 text-[0.9rem]', MONITOR_MUTED)}>{subtitle}</p>
      <div className={cn('flex flex-wrap items-baseline gap-x-3.5 gap-y-2 p-6', MONITOR_CARD)}>
        {words.map((w) => {
          const { style, className } = cloudEntry(w.weight);
          return w.url ? (
            <a
              key={w.key}
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              style={style}
              className={cn('leading-tight no-underline hover:underline', className)}
            >
              {w.word}
            </a>
          ) : (
            <span key={w.key} style={style} className={cn('leading-tight', className)}>
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}
