import { socialPostPayloadSchema, bahnPayloadSchema } from '@gruenerator/contracts';

import { coerceSharepicVariants } from '../hooks/useChatGraphStream';

export interface PersistedToolCallLike {
  toolName: string;
  result?: unknown;
}

/**
 * The `custom.*` render fields that live on a persisted TOOL CALL rather than
 * on the message metadata: sharepic variants, social post, Bahn board, reel
 * cards. One function for both reload paths — the web converter
 * (`runtime/threadMessageConversion.ts`) and the native adapter
 * (`adapters/messageConversion.ts`) — so a field cannot survive a reload on one
 * platform and vanish on the other (#3288). Validation mirrors what the live
 * stream applies.
 */
export function buildToolDerivedCustom(
  toolCalls: readonly PersistedToolCallLike[] | undefined
): Record<string, unknown> {
  const custom: Record<string, unknown> = {};
  if (!toolCalls?.length) return custom;

  // Drop any variant with a non-canonical canvasType so the studio handoff
  // stays safe.
  const sharepicCall = toolCalls.find((tc) => tc.toolName === 'sharepic');
  const validSharepicVariants = coerceSharepicVariants(
    (sharepicCall?.result as { variants?: unknown } | undefined)?.variants
  );
  if (validSharepicVariants) custom.sharepicData = { variants: validSharepicVariants };

  // EXPERIMENTAL combined social post (text half). The persisted result
  // additionally carries `versions`, which the head schema ignores.
  const socialPostCall = toolCalls.find((tc) => tc.toolName === 'social_post');
  if (socialPostCall?.result) {
    const parsedPost = socialPostPayloadSchema.safeParse(socialPostCall.result);
    if (parsedPost.success) custom.socialPostData = parsedPost.data;
  }

  // Deutsche-Bahn departure board. The condensed timetable a `bahn__*` loop
  // step returned IS the BahnPayload the live `bahn` SSE event carried. The
  // LAST step that PARSES wins (freshest board) — not merely the last bahn__
  // step: the prompt instructs a raw get_full_timetable_changes call AFTER the
  // condensed timetable, which must not shadow the board on reload.
  for (const tc of [...toolCalls].reverse()) {
    if (!tc.toolName.startsWith('bahn__')) continue;
    const bahnContent = (tc.result as { content?: unknown } | undefined)?.content;
    if (typeof bahnContent !== 'string') continue;
    try {
      const parsedBahn = bahnPayloadSchema.safeParse(JSON.parse(bahnContent));
      if (parsedBahn.success) {
        custom.bahnData = parsedBahn.data;
        break;
      }
    } catch {
      /* raw (non-condensed) tool result — keep looking */
    }
  }

  // Reel cards: the persisted results carry payloads identical to the
  // reel_processing / reel_picker SSE events.
  const reelProcessingCall = toolCalls.find((tc) => tc.toolName === 'reel_processing');
  if (reelProcessingCall?.result) custom.reelProcessing = reelProcessingCall.result;
  const reelPickerProjects = (
    toolCalls.find((tc) => tc.toolName === 'reel_picker')?.result as
      { projects?: unknown } | undefined
  )?.projects;
  if (Array.isArray(reelPickerProjects) && reelPickerProjects.length > 0) {
    custom.reelPicker = { projects: reelPickerProjects };
  }

  return custom;
}
