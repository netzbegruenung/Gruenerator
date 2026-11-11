import {
  agenturaToMarketplaceHref,
  stickerDiscoverToMarketplaceHref,
} from '@gruenerator/shared/marketplace';
import { type Href } from 'expo-router';

/** `/document/<id>` (API canonical) or `/office/<id>` / legacy `/docs/<id>` (web routes) → document id. */
export function documentIdFromUrl(url: string): string | null {
  const match = url.match(/^\/(?:document|docs|office)\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** Beschriftung des Öffnen-Links einer bestätigten Aktion — folgt dem Ziel, nicht dem Aktionstyp. */
export function actionUrlLabel(url: string): string {
  const [path = ''] = url.split(/[?#]/);
  if (documentIdFromUrl(url)) return 'Dokument öffnen';
  if (/^\/(?:projekte|gruppen)\//.test(path)) return 'Projekt öffnen';
  if (/^\/notebooks?\//.test(path)) return 'Notebook öffnen';
  if (/^\/boards\//.test(path)) return 'Board öffnen';
  if (/^\/(?:agentura\/agent|agents)\//.test(path)) return 'Agent öffnen';
  if (/^\/agentura\/(?:rezept|skill)\//.test(path)) return 'Rezept öffnen';
  return 'Öffnen';
}

/** Web paths the app has a native screen for under the same path. */
const NATIVE_PATHS = [
  /^\/projekte\/[^/?#]+/,
  /^\/vorlagen(?:[?#]|$)/,
  /^\/marktplatz(?:[?#]|$)/,
  /^\/notebook\/[^/?#]+/,
];

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
  // Das alte „Entdecken" für Sticker und Hintergründe ist heute der Marktplatz.
  const [path = '', query = ''] = url.split(/[?#]/);
  if (path === '/studio/sticker/entdecken')
    return stickerDiscoverToMarketplaceHref(new URLSearchParams(query)) as Href;
  if (NATIVE_PATHS.some((pattern) => pattern.test(url))) return url as Href;
  return { pathname: '/(fullscreen)/web-viewer', params: { path: url } };
}

/**
 * Grüneratoren-Pfade des Webs auf ihre Seiten in der App: Übersicht, Agentura
 * (heute der Marktplatz), Detailseiten und wiederkehrende Aufgaben (Meldungen verlinken
 * `/wiederkehrend?task=<id>`). Anlegen und Bearbeiten (`/agents/new`,
 * `/agentura/rezept/neu`, `…/bearbeiten`) bleiben bewusst beim Web-Viewer —
 * ein Link dorthin trägt keinen Entwurf mit, den die App übernehmen könnte.
 */
function grueneratorenRoute(url: string): Href | null {
  const [path = '', query = ''] = url.split(/[?#]/);
  if (path === '/grueneratoren' || path === '/agents') return '/(focused)/agents';
  if (path === '/agentura') {
    const target = agenturaToMarketplaceHref(new URLSearchParams(query));
    // Die alten Übersichts-Regale führen auf `/grueneratoren`.
    return target.startsWith('/grueneratoren') ? '/(focused)/agents' : (target as Href);
  }
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
  // `/agents/<slug>` ist, was `create_user_agent` im Chat zurückgibt.
  const userAgent = path.match(/^\/agents\/([^/]+)$/);
  if (userAgent && userAgent[1] !== 'new') {
    return {
      pathname: '/(focused)/grueneratoren/agent/[slug]',
      params: { slug: decodeURIComponent(userAgent[1]!) },
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

/**
 * Ob der Öffnen-Link einer bestätigten Aktion irgendwohin führt. Ein nativer
 * Bildschirm genügt; sonst landet die Seite im Web-Viewer, und der öffnet nur
 * Pfade aus der Allowlist der API (`EMBEDDABLE_PATH_PREFIXES`). Die steht hier
 * bewusst nicht noch einmal, nur die Familien, die Bestätigungen tatsächlich
 * liefern — alles andere (z. B. `/settings/wolke`) bekäme einen Link ins Leere.
 */
const EMBEDDABLE_RESULT_PATHS = [/^\/boards\//, /^\/notebooks?\//, /^\/studio\/canvas\//];

export function actionUrlIsOpenable(url: string): boolean {
  const route = actionUrlToRoute(url);
  const viaWebViewer =
    typeof route === 'object' &&
    'pathname' in route &&
    route.pathname === '/(fullscreen)/web-viewer';
  if (!viaWebViewer) return true;
  const [path = ''] = url.split(/[?#]/);
  return EMBEDDABLE_RESULT_PATHS.some((pattern) => pattern.test(path));
}
