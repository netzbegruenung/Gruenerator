import { parseSharepicChatProps, type SharepicChatReview } from '@gruenerator/contracts';

import { dropCachedSharepicRender } from '../hooks/useSharepicThumbnail';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicReviewStore } from '../stores/sharepicReviewStore';

import type { SharepicVariant } from '../hooks/useChatGraphStream';

/**
 * Runs the studio's vision review on the creator sharepics a turn just made,
 * once the turn is over (the corrected spec is saved onto the persisted
 * variant). Hosts that cannot render (the app) inject no reviewer.
 */
export function reviewFreshSharepics(
  threadId: string,
  variants: readonly SharepicVariant[],
  review: SharepicChatReview
): void {
  const reviewSharepic = useChatConfigStore.getState().reviewSharepic;
  if (!reviewSharepic) return;
  for (const variant of variants) {
    if (variant.canvasId || !parseSharepicChatProps(variant.initialProps)) continue;
    const store = useSharepicReviewStore.getState();
    if (store.checking[variant.id] || store.reviewed[variant.id]) continue;
    store.setChecking(variant.id, true);
    reviewSharepic({ threadId, variantId: variant.id, initialProps: variant.initialProps, review })
      .then((props) => {
        if (!props) return;
        dropCachedSharepicRender(variant.id);
        useSharepicReviewStore.getState().setReviewed(variant.id, props);
      })
      .catch((err: unknown) => {
        // swallow-ok: the draft stays as it is, the review is a refinement
        console.warn('[sharepicReview] review failed:', err);
      })
      .finally(() => useSharepicReviewStore.getState().setChecking(variant.id, false));
  }
}
