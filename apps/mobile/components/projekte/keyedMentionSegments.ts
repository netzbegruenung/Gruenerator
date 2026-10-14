import { groupMentionSegments } from '@gruenerator/shared/utils';

export type GroupMentionSegment = ReturnType<typeof groupMentionSegments>[number];

/** Segments keyed by their character offset, stable across re-renders. */
export function keyedMentionSegments(
  text: string
): Array<{ key: string; segment: GroupMentionSegment }> {
  let offset = 0;
  return groupMentionSegments(text).map((segment) => {
    const key = `m-${offset}`;
    offset += segment.kind === 'text' ? segment.text.length : segment.raw.length;
    return { key, segment };
  });
}
