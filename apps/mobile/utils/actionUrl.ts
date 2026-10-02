import { type Href } from 'expo-router';

/** `/document/<id>` (API canonical) or `/office/<id>` / legacy `/docs/<id>` (web routes) → document id. */
export function documentIdFromUrl(url: string): string | null {
  const match = url.match(/^\/(?:document|docs|office)\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** Web paths the app has a native screen for under the same path. */
const NATIVE_PATHS = [/^\/projekte\/[^/?#]+/, /^\/vorlagen(?:[?#]|$)/, /^\/notebook\/[^/?#]+/];

/**
 * Map a backend action_url (a web path) to a mobile route. Document URLs have
 * no expo-router screen — they open via the fullscreen doc editor, which reads
 * `id` from useLocalSearchParams. A path the app has a screen for is pushed
 * as-is; everything else (boards, recurring tasks, notebook settings) opens in
 * the web viewer rather than on expo-router's "Unmatched route" screen.
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
  if (/^\/gruppen(?:[?#]|$)/.test(url)) return '/(focused)/projekte';
  const chatThread = url.match(/^\/chat\/([^/?#]+)/);
  if (chatThread) {
    return { pathname: '/(focused)/chat-conversation', params: { threadId: chatThread[1]! } };
  }
  if (NATIVE_PATHS.some((pattern) => pattern.test(url))) return url as Href;
  return { pathname: '/(fullscreen)/web-viewer', params: { path: url } };
}
