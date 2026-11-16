/**
 * Bestellen einer Antragsgrün-Seite: wer eingeladen wird, wie viele Seiten eine
 * Person anlegen darf, und die Zeile in `antragsgruen_hosted_sites`.
 *
 * Eingeladen wird immer die bestellende Person selbst, mit der Adresse ihres
 * Grünerator-Kontos — nie eine Adresse aus dem Chat. Sonst schickte
 * antragsgruen.de auf Zuruf Mails mit Zugangsdaten an beliebige Dritte.
 */
import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import {
  createAntragsgruenSite,
  hostingConfigFromEnv,
  type CreatedSite,
  type SiteRequest,
} from './createSite.js';
import { AntragsgruenFormError } from './formClient.js';

/** Jede Seite ist echt und bleibt bei Antragsgrün stehen; die Grenze hält Versehen klein. */
export const MAX_SITES_PER_USER = 3;

export interface SiteOrder {
  title: string;
  organization: string;
  subdomain: string;
}

const DELIVERABLE_EMAIL_RE = /^[^@\s]+@[^@\s:]+\.[a-z]{2,}$/i;

export class SiteOrderRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiteOrderRefused';
  }
}

export async function inviteeOf(userId: string): Promise<SiteRequest['invitee'] | null> {
  const rows = (await getPostgresInstance().query(
    `SELECT email, first_name, last_name, display_name FROM profiles WHERE id = $1`,
    [userId]
  )) as {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  }[];
  const p = rows[0];
  // Eine Adresse, an die nichts zugestellt werden kann (z. B. `dev@localhost:3001`),
  // legte bei Antragsgrün ein Konto an, dessen Zugangsdaten nie ankommen.
  if (!p?.email || !DELIVERABLE_EMAIL_RE.test(p.email)) return null;
  const [given, ...family] = (p.display_name ?? '').trim().split(/\s+/);
  return {
    email: p.email,
    nameGiven: p.first_name?.trim() || given || '',
    nameFamily: p.last_name?.trim() || family.join(' '),
  };
}

export async function sitesOrderedBy(userId: string): Promise<number> {
  const rows = (await getPostgresInstance().query(
    `SELECT COUNT(*)::int AS n FROM antragsgruen_hosted_sites WHERE user_id = $1`,
    [userId]
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Läuft erst nach der Bestätigung durch die Person (`confirmController`). */
export async function orderAntragsgruenSite(
  userId: string,
  order: SiteOrder
): Promise<CreatedSite> {
  const config = hostingConfigFromEnv();
  if (!config)
    throw new SiteOrderRefused('Das Anlegen von Antragsgrün-Seiten ist hier nicht eingerichtet.');
  if ((await sitesOrderedBy(userId)) >= MAX_SITES_PER_USER) {
    throw new SiteOrderRefused(
      `Du hast schon ${MAX_SITES_PER_USER} Antragsgrün-Seiten über den Grünerator angelegt.`
    );
  }
  const invitee = await inviteeOf(userId);
  if (!invitee)
    throw new SiteOrderRefused('Dein Konto hat keine gültige E-Mail-Adresse für die Einladung.');

  try {
    const site = await createAntragsgruenSite({ ...order, invitee }, config);
    await record(userId, order, site.url);
    return site;
  } catch (err) {
    // Halb angelegt: die Seite steht, die Einladung fehlt. Die Zeile hält fest,
    // dass es sie gibt und wem sie gehört, damit jemand die Einladung nachholt.
    if (err instanceof AntragsgruenFormError && err.siteUrl) {
      await record(userId, order, err.siteUrl);
    }
    throw err;
  }
}

async function record(userId: string, order: SiteOrder, url: string) {
  await getPostgresInstance().query(
    `INSERT INTO antragsgruen_hosted_sites (user_id, subdomain, title, url)
     VALUES ($1, $2, $3, $4)`,
    [userId, order.subdomain, order.title, url]
  );
}
