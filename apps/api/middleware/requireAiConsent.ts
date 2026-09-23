/**
 * Serverseitige Durchsetzung der Art.-9-Einwilligung (Art. 9 Abs. 2 lit. a
 * DSGVO) an den KI-Eingängen.
 *
 * Die Einwilligung wird in beiden Clients eingeholt (Web-Gate, Mobile-Gate).
 * Das ist die zweite Verteidigungslinie: ein direkter API-Aufruf mit gültigem
 * Token umgeht das Gate sonst vollständig.
 *
 * **403, nicht 401.** Die Sitzung ist gültig — es fehlt nur die Einwilligung.
 * Auf 401 räumen beide Clients die Anmeldung ab (`handleUnauthorized` im Web,
 * der Token-Refresh-Pfad auf Mobile), und die Nutzer*in stünde nach dem
 * Einwilligen erneut vor dem Login statt vor ihrer Anfrage.
 *
 * **Bis zum Mobile-Release nur beobachtend.** Ohne `ENFORCE_AI_CONSENT=true`
 * lässt die Middleware durch und protokolliert lediglich. Grund steht an der
 * Env-Variable: eine ausgelieferte Binary ohne Gate fragt nie nach der
 * Einwilligung und wäre ab dem Deploy von allen KI-Funktionen ausgesperrt.
 */

import { AI_CONSENT_REQUIRED_CODE, type UserProfile } from '@gruenerator/contracts';
import { type Request, type Response, type NextFunction } from 'express';

import { env } from '../config/env.js';
import { getProfileService } from '../services/user/index.js';
import { createLogger } from '../utils/logger.js';

import { type ApiKeyContext } from './apiKeyMiddleware.js';
import { type AuthenticatedRequest } from './types.js';

const log = createLogger('requireAiConsent');

// Eine Zeile pro Nutzer*in und Stunde. Im Beobachtungsmodus trifft die
// Middleware heute jeden Aufruf jedes Bestandsnutzers — ohne Dämpfung wäre das
// Log unlesbar und die Zahl, um die es geht (wie viele verschiedene Konten
// betroffen sind), darin nicht zu finden.
const OBSERVE_LOG_DEBOUNCE_MS = 60 * 60 * 1000;
const lastObserveLogAt = new Map<string, number>();

function maybeLogObserved(userId: string, path: string): void {
  const now = Date.now();
  const last = lastObserveLogAt.get(userId) ?? 0;
  if (now - last < OBSERVE_LOG_DEBOUNCE_MS) return;
  lastObserveLogAt.set(userId, now);
  log.info('[AiConsent] would-block user=%s path=%s (ENFORCE_AI_CONSENT=false)', userId, path);
  const cutoff = now - OBSERVE_LOG_DEBOUNCE_MS * 2;
  for (const [k, t] of lastObserveLogAt) {
    if (t < cutoff) lastObserveLogAt.delete(k);
  }
}

const CONSENT_REQUIRED_BODY = {
  error: 'AI consent required',
  code: AI_CONSENT_REQUIRED_CODE,
  message:
    'Für die KI-Funktionen fehlt Deine ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO.',
};

/**
 * Das Urteil von `requireAiConsent` ohne Antwort — für KI-Nebenwirkungen, die
 * ohne Einwilligung still entfallen, statt die ganze Anfrage abzuweisen.
 */
export function sessionHasAiConsent(user: Pick<UserProfile, 'ai_consent_at'>): boolean {
  return !env.ENFORCE_AI_CONSENT || user.ai_consent_at != null;
}

/**
 * Muss **nach** `requireAuth` laufen. Ohne aufgelöste Sitzung lässt die
 * Middleware durch: die 401 gehört `requireAuth`, und ein 403 auf einen
 * anonymen Aufruf wäre die falsche Auskunft.
 */
export function requireAiConsent(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) return next();
  if (user.ai_consent_at != null) return next();

  const path = req.originalUrl.split('?')[0] ?? req.originalUrl;

  if (!env.ENFORCE_AI_CONSENT) {
    maybeLogObserved(user.id, path);
    return next();
  }

  log.warn('[AiConsent] blocked user=%s path=%s', user.id, path);
  res.status(403).json(CONSENT_REQUIRED_BODY);
}

/**
 * Dasselbe Urteil für Pfade ohne Express-Sitzung — heute der MCP-Server, der
 * seine eigenen OAuth-Tokens auflöst und `req.user` nur mit der ID belegt.
 *
 * Liest das Profil direkt aus der DB statt aus einem Cache: MCP-Verkehr ist
 * klein gegenüber dem Web, und ein Widerruf soll den Weg über den Konnektor
 * sofort schließen — an genau der Lücke, wegen der die Prüfung hier überhaupt
 * steht (die Einwilligung wurde beim Anmelden im Web erteilt, der Widerruf
 * dort erreicht den MCP-Pfad sonst nie).
 *
 * Bei einem Lesefehler `true` (ausser mit `failClosed`): eine DB-Störung darf
 * im Request-Pfad nicht wie ein Widerruf wirken. Die Durchsetzung ist die zweite Verteidigungslinie, nicht die erste.
 */
export async function hasAiConsent(
  userId: string,
  opts: { failClosed?: boolean } = {}
): Promise<boolean> {
  if (!env.ENFORCE_AI_CONSENT) return true;
  try {
    const profile = await getProfileService().getProfileById(userId);
    return profile?.ai_consent_at != null;
  } catch (err) {
    log.warn('[AiConsent] profile read failed for %s: %s', userId, (err as Error).message);
    // Hintergrundarbeit (`failClosed`) wartet lieber einen Lauf, als ohne
    // geprüfte Einwilligung ein Modell zu fragen — hier wartet niemand.
    return !opts.failClosed;
  }
}

/**
 * Dasselbe für `/api/v1` (API-Schlüssel oder MCP-OAuth-Sitzung): dort setzt die
 * Anmeldung `req.apiKey`, nicht `req.user`. Muss nach `requireApiKey` bzw.
 * `requireAddinAuth` laufen.
 */
export async function requireApiKeyAiConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Der Typ-Import zieht die `req.apiKey`-Erweiterung auch in Programme, die
  // `apiKeyMiddleware.ts` sonst nicht sehen (tsconfig.integration.json).
  const apiKey: ApiKeyContext | undefined = req.apiKey;
  const userId = apiKey?.userId;
  if (!userId || (await hasAiConsent(userId))) return next();
  log.warn('[AiConsent] blocked api-key user=%s path=%s', userId, req.originalUrl.split('?')[0]);
  res.status(403).json(CONSENT_REQUIRED_BODY);
}

export default requireAiConsent;
