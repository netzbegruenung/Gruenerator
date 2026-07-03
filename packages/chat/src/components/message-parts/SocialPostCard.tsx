import { useCallback, useEffect } from 'react';
import { SOCIAL_PLATFORM_INFO, type SocialPostPayload } from '@gruenerator/contracts';
import { FlaskConical, SquarePen } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../../stores/socialPostLiveStore';

import { CopyTextButton } from './CopyTextButton';
import { SharepicVariantStack } from './SharepicVariantStack';

import type { SharepicData } from '../../hooks/useChatGraphStream';

/**
 * Combined social post card (EXPERIMENTAL): the generated platform text plus
 * the sharepic variants of the same turn in one container. The sharepic half
 * is the untouched SharepicVariantStack — version stepper, download, studio
 * handoff and "Im Chat bearbeiten" all keep working per variant.
 */
export function SocialPostCard({
  post,
  sharepicData,
}: {
  post: SocialPostPayload;
  sharepicData?: SharepicData;
}) {
  // Live head (chat text edits bump it via social_post_updated); the message
  // payload is the seed. Mount-upsert so the sidebar can read this post even
  // after a thread reload.
  const live = useSocialPostLiveStore((s) => s.entries[post.postId]) ?? post;
  const activePost = useSocialPostLiveStore((s) => s.activePost);
  const isActiveForChat = activePost?.postId === post.postId;
  useEffect(() => {
    useSocialPostLiveStore.getState().upsertEntry(post);
  }, [post]);

  const info = SOCIAL_PLATFORM_INFO[live.platform] ?? SOCIAL_PLATFORM_INFO.generic;
  const overLimit = live.charCount > info.maxChars;

  const toggleActive = useCallback(() => {
    const store = useSocialPostLiveStore.getState();
    const sharepicStore = useSharepicLiveStore.getState();
    const ownVariantIds = new Set((sharepicData?.variants ?? []).map((v) => v.id));
    if (store.activePost?.postId === post.postId) {
      store.setActivePost(null);
      // Symmetric deactivation: the variant this activation brought along
      // must not linger as a silent Sharepic-Modus.
      const active = sharepicStore.activeVariant;
      if (active && ownVariantIds.has(active.variantId)) {
        sharepicStore.setActiveVariant(null);
      }
      return;
    }
    store.setActivePost({ postId: post.postId, post: live });
    // Bring the first sharepic variant along so the panel shows both halves.
    const first = sharepicData?.variants?.[0];
    if (first && !sharepicStore.activeVariant) {
      sharepicStore.setActiveVariant({
        variantId: first.id,
        canvasId: first.canvasId ?? null,
        canvasType: first.canvasType,
        initialProps: first.initialProps,
        ...(first.label ? { label: first.label } : {}),
        ...(first.pages ? { pages: first.pages } : {}),
      });
    }
  }, [post.postId, live, sharepicData]);

  return (
    <div
      className={cn(
        'mb-3 overflow-hidden rounded-lg border bg-background-alt',
        isActiveForChat ? 'border-primary ring-1 ring-primary' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            {info.label}-Post
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            title="Experimentelles Feature — Verhalten und Funktionen können sich ändern."
          >
            <FlaskConical className="h-3 w-3" />
            Experimentell
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-xs tabular-nums',
              overLimit ? 'font-medium text-red-600 dark:text-red-400' : 'text-foreground-muted'
            )}
            title={overLimit ? `Über dem ${info.label}-Limit` : 'Zeichen inkl. Hashtags'}
          >
            {live.charCount}/{info.maxChars}
          </span>
          {live.version > 1 && (
            <span className="text-xs text-foreground-muted">v{live.version}</span>
          )}
          <CopyTextButton
            text={live.text}
            ariaLabel="Post-Text kopieren"
            showLabel
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          />
          <button
            onClick={toggleActive}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
              isActiveForChat
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-foreground-muted hover:bg-primary/10 hover:text-foreground'
            )}
            aria-label={isActiveForChat ? 'Chat-Bearbeitung beenden' : 'Post im Chat bearbeiten'}
          >
            <SquarePen className="h-3.5 w-3.5" />
            <span>{isActiveForChat ? 'Aktiv' : 'Im Chat bearbeiten'}</span>
          </button>
        </div>
      </div>

      <div className="whitespace-pre-wrap px-3 py-3 text-sm text-foreground">{live.text}</div>

      {sharepicData && sharepicData.variants.length > 0 && (
        <div className="border-t border-border p-3 pb-0">
          <SharepicVariantStack data={sharepicData} />
        </div>
      )}
    </div>
  );
}
