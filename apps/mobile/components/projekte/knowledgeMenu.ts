import { type MenuAction } from '@expo/ui/community/menu';
import { landesverbandRecipeMentions, SKILL_SLIMS } from '@gruenerator/shared/agents';
import { type GroupFeedItem } from '@gruenerator/shared/groups';

export const DISCUSS_ID = 'discuss';

/** So viele Zeilen stehen da, bevor „Alle N anzeigen“ den Rest zeigt (wie im Web). */
export const KNOWLEDGE_SHOWN = 6;

/**
 * Wissen = alles außer Beiträgen (die gehören in den Austausch) und Rezepten
 * (die haben ihre eigene Karte, wie im Web).
 */
export function knowledgeItems(items: GroupFeedItem[]): GroupFeedItem[] {
  return items.filter((i) => i.kind !== 'post' && i.kind !== 'recipe');
}

/** Die ins Projekt geteilten Rezepte — Chats im Projekt laden sie vorab. */
export function recipeItems(items: GroupFeedItem[]): GroupFeedItem[] {
  return items.filter((i) => i.kind === 'recipe');
}

/**
 * Was das Projekt über seinen Landesverband von selbst mitbringt
 * (`streamContext.ts`): nicht geteilt, also auch nicht zu entfernen — nur zu
 * zeigen. Schon geteilte stehen in der Liste und fallen hier heraus.
 */
export function landesverbandRecipes(
  landesverband: string | null | undefined,
  shared: Pick<GroupFeedItem, 'slug'>[]
): { mention: string; title: string }[] {
  const have = new Set(shared.map((i) => i.slug));
  return landesverbandRecipeMentions(landesverband)
    .filter((mention) => !have.has(mention))
    .flatMap((mention) => {
      const skill = SKILL_SLIMS.find((s) => s.mention === mention);
      return skill ? [{ mention, title: skill.title }] : [];
    });
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
