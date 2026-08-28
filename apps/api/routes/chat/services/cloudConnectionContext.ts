/**
 * „Hat dieses Konto überhaupt eine Wolke?" — die Frage, die entscheidet, ob
 * `cloud_files` im Werkzeugkatalog dieses Turns steht.
 *
 * Sie muss VOR dem Katalogbau beantwortet sein (`buildChatToolCatalog` ist
 * synchron) und sie darf nicht jeden Turn eine Profilzeile kosten — deshalb
 * derselbe Zuschnitt wie `McpServerRegistry.getClassifierContext`: ein kleiner
 * Prozess-Cache mit kurzer Lebensdauer.
 *
 * Warum ein Zähler und nicht bloß ein Vokabular-Tor: ein Tor, das aus dem Text
 * schließt, verliert stumm Recall („Welche Ordner gibt es?" nennt die Wolke
 * nicht), und eine erfundene Fehlanzeige ist die teuerste Ausfallform. Wer eine
 * Verbindung hat, bekommt das Werkzeug immer; das Vokabular ist nur der zweite
 * Halt für Konten OHNE Verbindung, damit sie überhaupt eine anlegen können.
 */

import { isCloudShareUrl } from '@gruenerator/shared/utils';

import { NextcloudShareManager } from '../../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('cloudConnectionContext');

const TTL_MS = 60_000;

const cache = new Map<string, { at: number; count: number }>();

/** Nur für Tests: den Prozess-Cache leeren. */
export function resetCloudConnectionCache(): void {
  cache.clear();
}

/**
 * Wie viele AKTIVE eigene Verbindungen das Konto hat. Über Gruppen geteilte
 * Links zählen hier bewusst nicht mit: sie kosten eine zweite, teurere Abfrage
 * (drei Joins), und wer nur geteilte Links hat, erreicht das Werkzeug über das
 * Vokabular-Tor.
 */
export async function countCloudConnections(userId: string): Promise<number> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.count;
  try {
    const links = await NextcloudShareManager.getShareLinks(userId);
    const count = links.filter((l) => l.is_active !== false).length;
    cache.set(userId, { at: Date.now(), count });
    return count;
  } catch (err) {
    // Ein Fehler darf das Werkzeug nicht dauerhaft verstecken — nicht cachen,
    // beim nächsten Turn neu fragen.
    log.warn('share-link count failed', err);
    return 0;
  }
}

/**
 * Redet der Turn über eine Dateiablage? Zweiter Halt des Tors, absichtlich eng:
 * was hier trifft, liegt im Katalog und kostet Tokens.
 *
 * `\b` ist neben Umlauten tot (`\bÖffne` scheitert), deshalb Lookarounds.
 */
const CLOUD_VOCABULARY =
  /(?<![\wäöüß])(wolke|nextcloud|teamtools|freigabe[- ]?link|share[- ]?link|cloud[- ]?ordner)(?![\wäöüß])/i;

export function mentionsCloudStorage(text: string | null | undefined): boolean {
  if (!text) return false;
  if (CLOUD_VOCABULARY.test(text)) return true;
  // Ein eingefügter Freigabe-Link ist das stärkste Signal und nennt oft kein
  // einziges Wort aus der Liste oben — „füge das hinzu: https://teamtools…/s/x".
  return findCloudShareUrls(text).length > 0;
}

/**
 * Die Freigabe-Links in einem Text.
 *
 * Zwei Verbraucher, und der zweite ist der Grund: der Klassifikator erkennt
 * getippte URLs und schickt sie auf `scrape_url` — bei einem Nextcloud-Share
 * holt das die SPA-Hülle statt des Ordnerinhalts. Ein Share-Link ist keine
 * Webseite, er ist eine Verbindung.
 */
export function findCloudShareUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(URL_IN_TEXT);
  if (!matches) return [];
  const found = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    if (isCloudShareUrl(cleaned)) found.add(cleaned);
  }
  return [...found];
}

/** Dieselbe Form wie `extractUrls` im Klassifikator — bewusst dupliziert
 *  gehalten wäre falsch, aber ein Import von dort erzeugte einen Zyklus. */
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;
