import { type GroupShareComment } from '@gruenerator/contracts';
import { type GroupFeedItem } from '@gruenerator/shared/groups';

/** The person behind a feed item: the post author, or whoever shared it. */
export function feedItemPersonId(item: GroupFeedItem): string | null {
  return item.post?.authorId ?? item.sharedById ?? null;
}

/** Hiding is offered on other people's content only, and only when we know who they are. */
export function canHidePerson(personId: string | null, ownId: string | null): personId is string {
  return !!personId && personId !== ownId;
}

export function filterHiddenFeed(items: GroupFeedItem[], hiddenIds: ReadonlySet<string>) {
  if (hiddenIds.size === 0) return items;
  return items.filter((item) => {
    const id = feedItemPersonId(item);
    return !id || !hiddenIds.has(id);
  });
}

/** Drops only the hidden people's comments; `threadComments` promotes orphaned replies to top level. */
export function filterHiddenComments(
  comments: GroupShareComment[],
  hiddenIds: ReadonlySet<string>
): GroupShareComment[] {
  if (hiddenIds.size === 0) return comments;
  return comments.filter((c) => !(c.userId && hiddenIds.has(c.userId)));
}
