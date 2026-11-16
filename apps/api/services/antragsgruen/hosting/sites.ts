/**
 * Bestellen einer Antragsgrün-Seite: wer eingeladen wird, wie viele Seiten eine
 * Person anlegen darf, und die Zeile in `antragsgruen_hosted_sites`.
 *
 * Eingeladen wird immer die bestellende Person selbst, mit der Adresse ihres
 * Grünerator-Kontos — nie eine Adresse aus dem Chat. Sonst schickte
 * antragsgruen.de auf Zuruf Mails mit Zugangsdaten an beliebige Dritte.
 */
import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import { agendaOf, setAgenda, type AgendaEntry, type AgendaItemRef } from './agenda.js';
import { createAntragsgruenSite, type CreatedSite, type SiteRequest } from './createSite.js';
import { AntragsgruenFormError, FormClient } from './formClient.js';
import { createMotionOnHostedSite, type CreatedMotion } from './motions.js';
import { motionTypeOf, splitSiteUrl } from './motions.js';
import { hostingConfigFromEnv, isSiteAdmin, login } from './session.js';

/** Jede Seite ist echt und bleibt bei Antragsgrün stehen; die Grenze hält Versehen klein. */
export const MAX_SITES_PER_USER = 3;

export interface SiteOrder {
  title: string;
  organization: string;
  subdomain: string;
  agenda?: AgendaEntry[] | null;
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

export interface HostedSite {
  id: string;
  subdomain: string;
  title: string;
  url: string;
  created_at: Date;
}

/** Die Seiten, die die Person über den Grünerator angelegt hat — nur auf ihnen stellt er Anträge ein. */
export async function hostedSitesOf(userId: string): Promise<HostedSite[]> {
  return (await getPostgresInstance().query(
    `SELECT id, subdomain, title, url, created_at FROM antragsgruen_hosted_sites
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )) as HostedSite[];
}

/** `unknown`: antragsgruen.de war nicht erreichbar oder der Login scheiterte. */
export type SiteAccess = 'admin' | 'removed' | 'unknown';

/** Live bei antragsgruen.de: ist das Grünerator-Konto auf jeder Seite der Person noch Admin? */
export async function grueneratorAccessOn(userId: string): Promise<Record<string, SiteAccess>> {
  const sites = await hostedSitesOf(userId);
  const unknown = () => Object.fromEntries(sites.map((s) => [s.id, 'unknown' as const]));
  const config = hostingConfigFromEnv();
  if (!config || sites.length === 0) return unknown();
  const client = new FormClient();
  try {
    await login(client, config);
  } catch {
    return unknown();
  }
  const entries = await Promise.all(
    sites.map(async (site): Promise<[string, SiteAccess]> => {
      try {
        const { origin, consultation } = splitSiteUrl(site.url);
        return [site.id, (await isSiteAdmin(client, origin, consultation)) ? 'admin' : 'removed'];
      } catch {
        return [site.id, 'unknown'];
      }
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Vergisst eine Seite: der Grünerator speichert danach nichts mehr über sie und
 * handelt dort nicht mehr. Bei Antragsgrün ändert das nichts — ob das Konto dort
 * Admin bleibt, entscheidet die Person auf ihrer Seite.
 */
export async function forgetHostedSite(userId: string, id: string): Promise<boolean> {
  const rows = (await getPostgresInstance().query(
    `DELETE FROM antragsgruen_hosted_sites WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  )) as { id: string }[];
  return rows.length > 0;
}

export interface MotionOrder {
  subdomain: string;
  title: string;
  text: string;
  reason: string | null;
  organization: string | null;
  /** Tagesordnungspunkt nach Code oder Titel. */
  agendaItem?: string | null;
}

/** Läuft erst nach der Bestätigung durch die Person (`confirmController`). */
export async function orderAntragsgruenMotion(
  userId: string,
  order: MotionOrder
): Promise<CreatedMotion> {
  const config = hostingConfigFromEnv();
  if (!config) throw new SiteOrderRefused('Antragsgrün ist hier nicht eingerichtet.');
  // Erneut gegen die Datenbank, nicht gegen die Karte: zwischen Karte und Klick
  // kann die Seite den Besitz gewechselt haben.
  const site = (await hostedSitesOf(userId)).find((s) => s.subdomain === order.subdomain);
  if (!site)
    throw new SiteOrderRefused(
      'Diese Antragsgrün-Seite hast du nicht über den Grünerator angelegt.'
    );
  const person = await inviteeOf(userId);
  if (!person) throw new SiteOrderRefused('Dein Konto hat keine gültige E-Mail-Adresse.');
  return createMotionOnHostedSite(
    {
      siteUrl: site.url,
      title: order.title,
      text: order.text,
      reason: order.reason,
      initiator: {
        name: `${person.nameGiven} ${person.nameFamily}`.trim() || person.email,
        email: person.email,
        organization: order.organization,
      },
      agendaItem: order.agendaItem ?? null,
    },
    config
  );
}

/** Eine eigene Seite der Person, mit eingeloggtem Grünerator-Konto, das dort noch Admin ist. */
async function adminSessionOn(userId: string, subdomain: string) {
  const config = hostingConfigFromEnv();
  if (!config) throw new SiteOrderRefused('Antragsgrün ist hier nicht eingerichtet.');
  const site = (await hostedSitesOf(userId)).find((s) => s.subdomain === subdomain);
  if (!site)
    throw new SiteOrderRefused(
      'Diese Antragsgrün-Seite hast du nicht über den Grünerator angelegt.'
    );
  const client = new FormClient();
  await login(client, config);
  const { origin, consultation } = splitSiteUrl(site.url);
  if (!(await isSiteAdmin(client, origin, consultation))) {
    throw new AntragsgruenFormError(
      'Das Grünerator-Konto ist auf dieser Seite nicht mehr Admin',
      'revoked'
    );
  }
  return { client, origin, consultation, site };
}

export async function readAntragsgruenAgenda(
  userId: string,
  subdomain: string
): Promise<AgendaItemRef[]> {
  const { client, origin, consultation } = await adminSessionOn(userId, subdomain);
  return agendaOf(client, origin, consultation);
}

/**
 * Ersetzt die Tagesordnung. Punkte mit demselben Code (sonst Titel) wie ein
 * vorhandener behalten dessen Id — die Anträge darunter bleiben dort.
 */
export async function orderAntragsgruenAgenda(
  userId: string,
  subdomain: string,
  entries: AgendaEntry[]
): Promise<AgendaItemRef[]> {
  const { client, origin, consultation } = await adminSessionOn(userId, subdomain);
  const { type } = await motionTypeOf(client, origin, consultation);
  const existing = await agendaOf(client, origin, consultation);
  return setAgenda(client, origin, consultation, entries, type.id, existing);
}
