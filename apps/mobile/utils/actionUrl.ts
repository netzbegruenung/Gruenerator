import { type Href } from 'expo-router';

/** `/document/<id>` (API canonical) or `/office/<id>` / legacy `/docs/<id>` (web routes) → document id. */
export function documentIdFromUrl(url: string): string | null {
  const match = url.match(/^\/(?:document|docs|office)\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Map a backend action_url (a web path) to a mobile route. Document URLs have
 * no expo-router screen — they open via the fullscreen doc editor, which reads
 * `id` from useLocalSearchParams. Everything else is pushed as-is.
 */
export function actionUrlToRoute(url: string): Href {
  const documentId = documentIdFromUrl(url);
  if (documentId) {
    return { pathname: '/(fullscreen)/doc-editor', params: { id: documentId } };
  }
  // Ältere Meldungen verlinken noch `/gruppen/<id>` — in der App heißt der Bildschirm Projekte.
  const legacyGroup = url.match(/^\/gruppen\/([^/?#]+)/);
  if (legacyGroup) {
    return { pathname: '/(focused)/projekte/[id]', params: { id: legacyGroup[1]! } };
  }
  return url as Href;
}
