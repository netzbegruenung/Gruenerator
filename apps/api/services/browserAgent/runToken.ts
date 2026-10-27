/**
 * Run-Token für den Browser-Dienst (`services/browser-agent`).
 *
 * Der Dienst fährt browser-use und braucht für jeden Schritt ein Modell. Einen
 * Modell-Key bekommt er nicht: er ruft unseren OpenAI-kompatiblen Endpunkt
 * (`routes/browserAgent/llmProxyRouter.ts`), und der geht über die eine
 * Fassade `services/ai/generate.ts`. Das Token sagt diesem Endpunkt, zu
 * welchem Lauf und welcher Person ein Aufruf gehört — für die Nutzungs-
 * zuordnung — und dass WIR den Lauf gestartet haben.
 *
 * Kurzlebig (10 min), weil es in einem fremden Prozess liegt und der Lauf
 * selbst nach 170 s abgebrochen wird. Muster: `services/search/imageProxySignature.ts`.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../../config/env.js';

/** Ein Lauf ist nach 170 s gedeckelt; 10 min lassen Luft für Warteschlange und Start. */
export const RUN_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface RunTokenClaims {
  runId: string;
  userId: string;
}

/** Toleranz für Uhrenversatz bei der Obergrenze der Laufzeit eines Tokens. */
const RUN_TOKEN_SKEW_MS = 30 * 1000;

/**
 * Eigenes Geheimnis, nur in der API. `BROWSER_AGENT_SECRET` taugt dafür nicht:
 * das liegt im Browser-Container (er prüft damit unseren Header), und wer den
 * Container übernimmt, könnte sich sonst Tokens für beliebige Personen und
 * Laufzeiten ausstellen. Kein Rückfall auf SESSION_SECRET, damit sich Tokens
 * unabhängig von den Sitzungen widerrufen lassen. Ist es nicht gesetzt — oder
 * versehentlich gleich dem Dienst-Geheimnis —, bleibt das Feature aus.
 */
function getSecret(): string | null {
  const secret = env.BROWSER_AGENT_TOKEN_SECRET;
  if (!secret || secret.trim().length === 0) return null;
  if (secret === env.BROWSER_AGENT_SECRET) return null;
  return secret;
}

export function isBrowserAgentConfigured(): boolean {
  return getSecret() !== null;
}

function computeSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `<base64url(JSON)>.<sig>`. Wirft ohne `BROWSER_AGENT_TOKEN_SECRET`. */
export function signRunToken(claims: RunTokenClaims & { expiresAt: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('BROWSER_AGENT_TOKEN_SECRET is not configured');
  const payload = Buffer.from(
    JSON.stringify({ runId: claims.runId, userId: claims.userId, expiresAt: claims.expiresAt })
  ).toString('base64url');
  return `${payload}.${computeSignature(secret, payload)}`;
}

/** Die Claims eines gültigen, nicht abgelaufenen Tokens, sonst null. */
export function verifyRunToken(token: string, now = Date.now()): RunTokenClaims | null {
  const secret = getSecret();
  if (!secret) return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Signatur VOR dem Parsen: ungeprüfte Bytes gehen nicht durch JSON.parse.
  const a = Buffer.from(computeSignature(secret, payload));
  const b = Buffer.from(sig);
  // timingSafeEqual wirft bei ungleicher Länge — deshalb der offene Vergleich davor.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { runId, userId, expiresAt } = parsed as Record<string, unknown>;
  if (typeof runId !== 'string' || typeof userId !== 'string') return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return null;
  }
  // Ein Token, das länger gilt, als wir je ausstellen, stammt nicht von uns.
  if (expiresAt - now > RUN_TOKEN_TTL_MS + RUN_TOKEN_SKEW_MS) return null;
  return { runId, userId };
}
