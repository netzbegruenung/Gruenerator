import { type MenuAction } from '@expo/ui/community/menu';
import { type GroupFeedItem } from '@gruenerator/shared/groups';

export const DISCUSS_ID = 'discuss';

/** Ab so vielen Zeilen lohnt sich ein Suchfeld (wie im Web). */
export const KNOWLEDGE_SEARCH_FROM = 6;

/** Wissen = alles außer Beiträgen; die gehören in den Austausch. */
export function knowledgeItems(items: GroupFeedItem[]): GroupFeedItem[] {
  return items.filter((i) => i.kind !== 'post');
}

/**
 * Das Zeilenmenü: „Im Austausch besprechen“ (nur wo es einen Austausch gibt und
 * der Eintrag eine Freigabe ist), dann die Verwaltung der Freigabe.
 */
export function buildKnowledgeActions(
  item: Pick<GroupFeedItem, 'share'>,
  canDiscuss: boolean,
  share: MenuAction[]
): MenuAction[] {
  const discuss: MenuAction[] =
    canDiscuss && item.share ? [{ id: DISCUSS_ID, title: 'Im Austausch besprechen' }] : [];
  return [...discuss, ...share];
}
