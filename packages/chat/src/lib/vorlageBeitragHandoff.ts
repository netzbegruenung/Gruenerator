/**
 * Hands a chat post to the studio's Vorlage page without putting it in the URL:
 * the chat stashes it per Vorlage, `/studio/vorlage/:id?mitBeitrag=1` takes it
 * once. Session-scoped and best effort — without storage the page opens the
 * plain copy, as it does without a post.
 */
const key = (id: string) => `gruenerator:vorlage-beitrag:${id}`;

export function stashVorlageBeitrag(id: string, beitrag: string): void {
  try {
    sessionStorage.setItem(key(id), beitrag);
  } catch {
    /* storage blocked — the page falls back to the plain copy */
  }
}

export function takeVorlageBeitrag(id: string): string | null {
  try {
    const beitrag = sessionStorage.getItem(key(id));
    sessionStorage.removeItem(key(id));
    return beitrag;
  } catch {
    return null;
  }
}
