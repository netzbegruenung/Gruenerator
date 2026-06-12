import { TweetCard } from '@gruenerator/ui';
import { FaBluesky } from 'react-icons/fa6';

import { BLUESKY_ACCOUNTS, useBlueskyFeed } from '../hooks/useBlueskyFeed';

import type { MonitorLocale } from '../hooks/useMonitor';

interface BlueskyFeedProps {
  locale: MonitorLocale;
}

export function BlueskyFeed({ locale }: BlueskyFeedProps) {
  const { data: posts, isLoading } = useBlueskyFeed(locale);
  const handle = BLUESKY_ACCOUNTS[locale];

  const formatTimestamp = (createdAt: string | null) =>
    createdAt
      ? new Date(createdAt).toLocaleString(locale === 'at' ? 'de-AT' : 'de-DE', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <section className="mb-2xl">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-lg font-semibold text-foreground">Von Bluesky</h2>
        <a
          href={`https://bsky.app/profile/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
        >
          <FaBluesky className="h-3.5 w-3.5" />@{handle}
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {[0, 1, 2].map((i) => {
          const post = posts?.[i];
          if (post) {
            return (
              <TweetCard
                key={`${post.uri}-${i}`}
                text={post.text}
                authorName={post.authorName}
                authorHandle={`@${post.authorHandle}`}
                avatarUrl={post.avatarUrl}
                icon={<FaBluesky className="h-5 w-5 text-grey-300" />}
                timestamp={formatTimestamp(post.createdAt)}
                href={post.url}
                repostedBy={post.repostedBy}
                showCharCount={false}
              />
            );
          }
          return (
            <div
              key={i}
              className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-dashed border-grey-300 dark:border-grey-600 p-lg bg-background opacity-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-sm">
                  <div className="h-10 w-10 rounded-full bg-grey-200 dark:bg-grey-700 shrink-0" />
                  <div className="space-y-1">
                    <div className="h-3 w-32 rounded bg-grey-200 dark:bg-grey-700" />
                    <div className="h-2.5 w-20 rounded bg-grey-100 dark:bg-grey-800" />
                  </div>
                </div>
                <FaBluesky className="h-5 w-5 text-grey-200 dark:text-grey-700" />
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[4rem]">
                <p className="text-xs text-grey-400 text-center">
                  {isLoading ? 'Wird geladen…' : 'Keine Beiträge'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
