import { useCallback, useEffect, useState } from 'react';
import { SOCIAL_PLATFORM_INFO, type SocialPostPayload } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { FlaskConical, Megaphone, SquarePen } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../../stores/socialPostLiveStore';

import { CopyTextButton } from './CopyTextButton';
import { SharepicVariantStack } from './SharepicVariantStack';
import { SocialPostSharepicColumn } from './SocialPostSharepicColumn';

import type { SharepicData } from '../../hooks/useChatGraphStream';

const COLLAPSE_THRESHOLD = 600;

/** Highlight hashtags inside the plain post text (design: primary, bold). */
function renderPostText(text: string): React.ReactNode[] {
  return text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, i) =>
    part.startsWith('#') ? (
      <span key={i} className="font-medium text-primary">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/**
 * Combined social post card (EXPERIMENTAL): the generated platform text plus
 * the sharepic variants of the same turn in one container. Two-column layout
 * ("Tool-Karte Redesign" 3a): text with context-near copy/char actions on the
 * left, a compact sharepic column (hero, thumbnail switcher, download/studio)
 * on the right. Deck variants don't fit the narrow column and fall back to
 * the full-width SharepicVariantStack embed.
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
  const title = live.platform === 'generic' ? 'Social Media-Post' : `${info.label}-Post`;

  const isCollapsible = live.text.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  const variants = sharepicData?.variants ?? [];
  const hasDeckVariant = variants.some((v) => v.pages && v.pages.length > 0);
  const showColumn = variants.length > 0 && !hasDeckVariant;
  const showFallbackEmbed = variants.length > 0 && hasDeckVariant;

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
        'mb-3 overflow-hidden rounded-lg border bg-surface',
        isActiveForChat ? 'border-primary ring-1 ring-primary' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
          title="Experimentelles Feature — Verhalten und Funktionen können sich ändern."
        >
          <FlaskConical className="h-3 w-3" />
          Experimentell
        </span>
        <span className="flex-1" />
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

      <div
        className={cn(
          'p-3 sm:p-4',
          showColumn && 'flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_13rem] sm:gap-5'
        )}
      >
        <div className="flex min-w-0 flex-col">
          <div
            className={cn(
              'whitespace-pre-wrap text-sm leading-relaxed text-foreground',
              isCollapsible && !expanded && 'line-clamp-[10]'
            )}
          >
            {renderPostText(live.text)}
          </div>
          {isCollapsible && (
            <div className="mt-2 flex">
              <Button variant="brand-ghost" size="xs" onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
              </Button>
            </div>
          )}
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-2">
            {live.version > 1 && (
              <span className="text-xs text-foreground-muted">v{live.version}</span>
            )}
            <span
              className={cn(
                'text-xs tabular-nums',
                overLimit ? 'font-medium text-red-600 dark:text-red-400' : 'text-foreground-muted'
              )}
              title={overLimit ? `Über dem ${info.label}-Limit` : 'Zeichen inkl. Hashtags'}
            >
              {live.charCount}/{info.maxChars}
            </span>
            <CopyTextButton
              text={live.text}
              ariaLabel="Post-Text kopieren"
              className="flex items-center rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            />
          </div>
        </div>

        {showColumn && sharepicData && <SocialPostSharepicColumn data={sharepicData} />}
      </div>

      {showFallbackEmbed && sharepicData && (
        <div className="border-t border-border p-3 pb-0">
          <SharepicVariantStack data={sharepicData} />
        </div>
      )}
    </div>
  );
}
