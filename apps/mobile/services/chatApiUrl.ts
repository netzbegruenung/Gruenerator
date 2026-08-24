import { stripApiPrefix } from '@gruenerator/shared/api';

/**
 * Die Basis fuer alle Chat-Aufrufe dieser App — dieselbe Konvention wie die
 * uebrigen fuenf Leser von EXPO_PUBLIC_API_URL (services/api.ts:14, auth.ts:17,
 * vorlagen.ts:3, reel.ts:22, hooks/useMessageActions.ts:9) und wie
 * .env.example sie vorgibt: **die Variable schliesst `/api` ein**.
 *
 * `chatConfig.ts` las sie bis 24.08.2026 als einzige ohne (#2821). Das fiel in
 * Produktion nicht auf, weil dort nichts gesetzt ist und die Vorgabe ohne `/api`
 * den doppelten Pfad genau ausglich — lokal ergab dieselbe Zeile
 * `http://10.0.2.2:3001/api/api/chat-graph/stream`, und zwar fuer JEDEN der 13
 * Endpunkte aus DEFAULT_ENDPOINTS, nicht fuer einen einzelnen.
 */
export const CHAT_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

/**
 * Die Naht zwischen zwei Konventionen: die Basis endet auf `/api`, die Pfade des
 * Chat-Stores beginnen damit.
 *
 * Eigenes Modul, damit die Zusammensetzung ohne `chatConfig.ts` pruefbar ist —
 * das zieht ueber den Paket-Barrel von @gruenerator/chat die halbe
 * assistant-ui-Kette und expo-router nach und laeuft in keiner der beiden
 * Test-Lanes.
 */
export function resolveChatUrl(url: string): string {
  // Server-gelieferte absolute URLs (DocumentCreatedCard, ComputeCard) gehen
  // unangetastet durch.
  if (url.startsWith('http')) return url;
  // `stripApiPrefix` schneidet NUR bei `/api/`-Praefix. Das ist noetig, weil ueber
  // denselben fetch auch server-gelieferte relative Pfade ohne ihn laufen — ein
  // bedingungsloses slice(4) wuerde die verstuemmeln.
  return `${CHAT_API_BASE_URL}${stripApiPrefix(url)}`;
}
