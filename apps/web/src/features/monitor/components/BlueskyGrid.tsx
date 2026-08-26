import { cn, Skeleton } from '@gruenerator/ui';

import { formatDateTime } from '../formatDateTime';
import { useBlueskyFeed } from '../hooks/useBlueskyFeed';

import {
  MONITOR_ACCENT,
  MONITOR_BODY,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_TILE,
} from './theme';

import type { MonitorLocale } from '../hooks/useMonitor';

/** How many posts the grid shows — a full three-column row on desktop. */
const MAX_POSTS = 9;

/** Latest posts of the locale's Grüne Bluesky account. */
export function BlueskyGrid({
  locale,
  className = 'mt-12',
}: {
  locale: MonitorLocale;
  /** Section spacing — the Feed page leads with this block, so it overrides. */
  className?: string;
}) {
  const { data: posts, isLoading } = useBlueskyFeed(locale);

  if (isLoading) {
    return (
      <section className={className}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className="h-40 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }
  if (!posts || posts.length === 0) return null;
  const account = posts[0]?.authorHandle;

  return (
    <section className={className}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Von Bluesky
        </h2>
        {account && (
          <span className={cn('text-[0.85rem] font-bold', MONITOR_ACCENT)}>@{account}</span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
        {posts.slice(0, MAX_POSTS).map((post) => (
          <div key={post.uri} className={cn('flex flex-col gap-3.5 p-6', MONITOR_TILE)}>
            <div className="flex flex-col gap-0.5">
              <span className={cn('text-[0.95rem] font-bold', MONITOR_HEADING)}>
                {post.authorName}
              </span>
              <span className={cn('text-[0.8rem]', MONITOR_FAINT)}>@{post.authorHandle}</span>
            </div>
            <p className={cn('m-0 flex-1 text-[0.92rem] leading-[1.6] line-clamp-5', MONITOR_BODY)}>
              {post.text}
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-[#eef2ef] pt-3 dark:border-grey-700/60">
              <span className={cn('text-[0.78rem]', MONITOR_FAINT)}>
                {formatDateTime(post.createdAt)}
              </span>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'text-[0.8rem] font-bold no-underline hover:underline',
                  MONITOR_ACCENT
                )}
              >
                Ansehen
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
