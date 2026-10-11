/**
 * Which chat sharepic a loop tool (`read_sharepic`, `edit_sharepic`,
 * `check_sharepic`) acts on. One rule for all three, so reading, editing and
 * checking never disagree about "das Sharepic":
 *   1. the id the model passed,
 *   2. the open card (Sharepic-Modus, `currentSharepic`),
 *   3. the newest sharepic of the thread.
 * Only creator sharepics qualify — a legacy template card has no spec to read
 * or redraft, and the template op lane (`handleSharepicEdit`) owns it.
 */
import { parseSharepicChatProps, type SharepicChatProps } from '@gruenerator/contracts';

import {
  getLastSharepicVariant,
  getSharepicVariantInWindow,
  type PriorSharepic,
} from './sharepicVariantHelpers.js';

export interface LoopSharepicTarget {
  prior: PriorSharepic;
  props: SharepicChatProps;
}

export async function resolveLoopSharepicTarget(
  threadId: string,
  currentSharepic: { variantId: string } | null | undefined,
  variantId?: string | null
): Promise<LoopSharepicTarget | null> {
  const named = variantId || currentSharepic?.variantId || null;
  const prior = named
    ? await getSharepicVariantInWindow(threadId, named)
    : await getLastSharepicVariant(threadId, null);
  const props = prior ? parseSharepicChatProps(prior.props) : null;
  return prior && props ? { prior, props } : null;
}
