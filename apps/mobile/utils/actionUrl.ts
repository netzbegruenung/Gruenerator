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
 * as-is; everything else (boards, notebook settings) opens in the web viewer
 * rather than on expo-router's "Unmatched route" screen.
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
  const grueneratoren = grueneratorenRoute(url);
  if (grueneratoren) return grueneratoren;
  if (NATIVE_PATHS.some((pattern) => pattern.test(url))) return url as Href;
  return { pathname: '/(fullscreen)/web-viewer', params: { path: url } };
}

/**
 * Grüneratoren-Pfade des Webs auf ihre Seiten in der App: Übersicht, Agentura,
 * Detailseiten und wiederkehrende Aufgaben (Meldungen verlinken
 * `/wiederkehrend?task=<id>`). Anlegen und Bearbeiten (`/agents/new`,
 * `/agentura/rezept/neu`, `…/bearbeiten`) bleiben bewusst beim Web-Viewer —
 * ein Link dorthin trägt keinen Entwurf mit, den die App übernehmen könnte.
 */
function grueneratorenRoute(url: string): Href | null {
  const [path = '', query = ''] = url.split(/[?#]/);
  if (path === '/grueneratoren' || path === '/agents') return '/(focused)/agents';
  if (path === '/agentura') return { pathname: '/(focused)/agents', params: { agentura: '1' } };
  if (path === '/wiederkehrend') {
    const task = new URLSearchParams(query).get('task');
    return task
      ? { pathname: '/(focused)/grueneratoren/aufgabe/[id]', params: { id: task } }
      : '/(focused)/agents';
  }
  const agent = path.match(/^\/agentura\/agent\/([^/]+)$/);
  if (agent) {
    return {
      pathname: '/(focused)/grueneratoren/agent/[slug]',
      params: { slug: decodeURIComponent(agent[1]!) },
    };
  }
  const recipe = path.match(/^\/agentura\/(?:rezept|skill)\/([^/]+)$/);
  if (recipe && recipe[1] !== 'neu') {
    return {
      pathname: '/(focused)/grueneratoren/rezept/[mention]',
      params: { mention: decodeURIComponent(recipe[1]!) },
    };
  }
  return null;
}
