/**
 * Newsletter-Abo-Status aus Brevos Kontakt-API.
 *
 * Brevo hat zwei getrennte Zugangsdaten: der SMTP-Schlüssel (`BREVO_SMTP_PASS`,
 * Präfix `xsmtpsib-`) spricht nur das Relay in `services/email/emailService.ts`,
 * die REST-API verlangt einen eigenen Schlüssel (`BREVO_API_KEY`, `xkeysib-`)
 * im Header `api-key`. Der eine authentifiziert den anderen nicht.
 *
 * Fehler nehmen nie etwas weg: ein Brevo-Ausfall meldet `false` und wird
 * NICHT zwischengespeichert, damit der nächste Aufruf es erneut versucht.
 * Nur echte Auskünfte (auch „kennt Brevo nicht") landen im Cache.
 */

import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { getProfileService } from '../user/ProfileService.js';

const log = createLogger('brevoNewsletter');

/**
 * Brevo-Liste „Grünerator-Kontakte". Steht als Konstante und nicht in der
 * Umgebung, weil sie eine Produktentscheidung ist und keine Betriebsgröße —
 * so steht sie im Diff statt in drei Salt-Pillars.
 */
const NEWSLETTER_LIST_ID = 5;

const CACHE_TTL_SECONDS = 12 * 60 * 60;
const REQUEST_TIMEOUT_MS = 5_000;

const cachedStatusSchema = z.object({ subscribed: z.boolean() });

/** Nur die zwei Felder, auf die es ankommt — Brevo liefert deutlich mehr. */
const contactSchema = z.object({
  listIds: z.array(z.number()).default([]),
  emailBlacklisted: z.boolean().default(false),
});

async function fetchSubscription(email: string, apiKey: string): Promise<boolean | null> {
  let response: Response;
  try {
    response = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    log.warn(`Brevo nicht erreichbar: ${String(error)}`);
    return null;
  }

  // 404 ist eine Auskunft, kein Fehler: die Adresse ist Brevo unbekannt.
  if (response.status === 404) return false;

  if (!response.ok) {
    log.warn(`Brevo antwortete mit ${response.status}`);
    return null;
  }

  const parsed = contactSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    log.warn('Brevo-Antwort passt nicht zum erwarteten Schema');
    return null;
  }

  return parsed.data.listIds.includes(NEWSLETTER_LIST_ID) && !parsed.data.emailBlacklisted;
}

/**
 * Ob die Kontoadresse dieser Person den Newsletter abonniert hat.
 *
 * Falsch negativ ist möglich und hingenommen: wer sich mit der Dienstadresse
 * anmeldet und privat abonniert hat, gilt hier als nicht abonniert.
 */
export async function isNewsletterSubscriber(userId: string): Promise<boolean> {
  if (!userId || !env.BREVO_API_KEY) return false;

  const cacheKey = `newsletter_sub:${userId}`;
  const cached = await getCachedJson(cacheKey, cachedStatusSchema);
  if (cached) return cached.subscribed;

  const profile = await getProfileService().getProfileById(userId);
  const email = profile?.email;
  if (!email) return false;

  const subscribed = await fetchSubscription(email, env.BREVO_API_KEY);
  if (subscribed === null) return false;

  await setCachedJson(cacheKey, { subscribed }, CACHE_TTL_SECONDS);
  return subscribed;
}
