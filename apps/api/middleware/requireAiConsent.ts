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

import { AI_CONSENT_REQUIRED_CODE } from '@gruenerator/contracts';
import { type Request, type Response, type NextFunction } from 'express';

import { env } from '../config/env.js';
import { getProfileService } from '../services/user/index.js';
import { createLogger } from '../utils/logger.js';

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
  res.status(403).json({
    error: 'AI consent required',
    code: AI_CONSENT_REQUIRED_CODE,
    message:
      'Für die KI-Funktionen fehlt Deine ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO.',
  });
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
 * Bei einem Lesefehler `true`: eine DB-Störung darf nicht wie ein Widerruf
 * wirken. Die Durchsetzung ist die zweite Verteidigungslinie, nicht die erste.
 */
export async function hasAiConsent(userId: string): Promise<boolean> {
  if (!env.ENFORCE_AI_CONSENT) return true;
  try {
    const profile = await getProfileService().getProfileById(userId);
    return profile?.ai_consent_at != null;
  } catch (err) {
    log.warn('[AiConsent] profile read failed for %s: %s', userId, (err as Error).message);
    return true;
  }
}

export default requireAiConsent;
