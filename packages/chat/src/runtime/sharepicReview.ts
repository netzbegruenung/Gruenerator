import { parseSharepicChatProps, type SharepicChatReview } from '@gruenerator/contracts';

import { dropCachedSharepicRender } from '../hooks/useSharepicThumbnail';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';
import { useSharepicReviewStore } from '../stores/sharepicReviewStore';

import type { SharepicVariant } from '../hooks/useChatGraphStream';

/**
 * Runs the studio's vision review on the creator sharepics a turn just made,
 * once the turn is over (the corrected spec is saved onto the persisted
 * variant). Hosts that cannot render (the app) inject no reviewer. Resolves
 * once every review has settled.
 */
export async function reviewFreshSharepics(
  threadId: string,
  variants: readonly SharepicVariant[],
  review: SharepicChatReview
): Promise<void> {
  const reviewSharepic = useChatConfigStore.getState().reviewSharepic;
  if (!reviewSharepic) return;
  const pending: Promise<void>[] = [];
  for (const variant of variants) {
    if (variant.canvasId || !parseSharepicChatProps(variant.initialProps)) continue;
    const store = useSharepicReviewStore.getState();
    if (store.checking[variant.id] || store.reviewed[variant.id]) continue;
    store.setChecking(variant.id, true);
    pending.push(
      reviewSharepic({
        threadId,
        variantId: variant.id,
        initialProps: variant.initialProps,
        review,
      })
        .then((props) => {
          if (!props) return;
          dropCachedSharepicRender(variant.id);
          useSharepicReviewStore.getState().setReviewed(variant.id, props);
        })
        .catch((err: unknown) => {
          // swallow-ok: the draft stays as it is, the review is a refinement
          console.warn('[sharepicReview] review failed:', err);
        })
        .finally(() => useSharepicReviewStore.getState().setChecking(variant.id, false))
    );
  }
  await Promise.all(pending);
}

/**
 * Saves the primary variant of a sharepic the turn just made as a canvas, so
 * the Studio's Mediathek shows it without the person opening it first. Runs
 * after the review (the reviewed spec is what gets saved) and uploads a
 * thumbnail, because the Mediathek card shows the canvas thumbnail. The other
 * variants stay chat-only until someone opens them — saving every variant
 * would put three to four canvases per turn into the Mediathek.
 */
export async function saveFreshSharepic(
  threadId: string,
  variants: readonly SharepicVariant[]
): Promise<void> {
  const { saveSharepic, renderSharepic, updateSharepicThumbnail } = useChatConfigStore.getState();
  const primary = variants[0];
  if (!saveSharepic || !primary || primary.canvasId) return;
  if (useSharepicLiveStore.getState().entries[primary.id]) return;
  const initialProps =
    useSharepicReviewStore.getState().reviewed[primary.id] ?? primary.initialProps;
  try {
    const canvasId = await saveSharepic({ ...primary, initialProps }, threadId);
    if (!canvasId) return;
    useSharepicLiveStore.getState().upsertEntry(primary.id, { canvasId });
    const image = await renderSharepic?.(primary.canvasType, initialProps, { quality: 'preview' });
    if (image) await updateSharepicThumbnail?.(canvasId, image);
  } catch (err: unknown) {
    // swallow-ok: the sharepic stays in the chat; opening it saves it later
    console.warn('[sharepicReview] save failed:', err);
  }
}
