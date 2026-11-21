/**
 * Die Antragsgrün-Seiten einer Person: bestellen (der Grünerator legt sie an)
 * oder verbinden (die Person hat sie selbst angelegt und den Grünerator als
 * Admin eingetragen, #5690) — beides landet in `antragsgruen_hosted_sites`.
 *
 * Eingeladen wird immer die bestellende Person selbst, mit der Adresse ihres
 * Grünerator-Kontos — nie eine Adresse aus dem Chat. Sonst schickte
 * antragsgruen.de auf Zuruf Mails mit Zugangsdaten an beliebige Dritte.
 */
import * as cheerio from 'cheerio';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { deliverableContactOf } from '../../user/accountContact.js';
import { FormStepError, OrderRefused, type FormClient } from '../../webForms/formClient.js';

import { agendaOf, setAgenda, type AgendaEntry, type AgendaItemRef } from './agenda.js';
import { createAntragsgruenSite, type CreatedSite, type SiteRequest } from './createSite.js';
import { createMotionOnHostedSite, type CreatedMotion } from './motions.js';
import { motionTypeOf, splitSiteUrl } from './motions.js';
import {
  findOwnMotion,
  listOwnMotions,
  readOwnMotion,
  type OwnMotion,
  type OwnMotionRef,
} from './read.js';
import { botClient, hostingConfigFromEnv, isSiteAdmin, login, requireAdmins } from './session.js';

/** Jede Seite ist echt und bleibt bei Antragsgrün stehen; die Grenze hält Versehen klein. */
export const MAX_SITES_PER_USER = 3;

/** Verbundene Seiten legt die Person selbst an; die Grenze hält nur die Live-Prüfungen klein. */
export const MAX_CONNECTED_SITES_PER_USER = 10;

export interface SiteOrder {
  title: string;
  organization: string;
  subdomain: string;
  agenda?: AgendaEntry[] | null;
}

export async function sitesOrderedBy(userId: string): Promise<number> {
  const rows = (await getPostgresInstance().query(
    `SELECT COUNT(*)::int AS n FROM antragsgruen_hosted_sites WHERE user_id = $1 AND kind = 'created'`,
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
    throw new OrderRefused('Das Anlegen von Antragsgrün-Seiten ist hier nicht eingerichtet.');
  if ((await sitesOrderedBy(userId)) >= MAX_SITES_PER_USER) {
    throw new OrderRefused(
      `Du hast schon ${MAX_SITES_PER_USER} Antragsgrün-Seiten über den Grünerator angelegt.`
    );
  }
  const invitee = await deliverableContactOf(userId);
  if (!invitee)
    throw new OrderRefused('Dein Konto hat keine gültige E-Mail-Adresse für die Einladung.');

  try {
    const site = await createAntragsgruenSite({ ...order, invitee }, config);
    await record(userId, order, site.url);
    return site;
  } catch (err) {
    // Halb angelegt: die Seite steht, die Einladung fehlt. Die Zeile hält fest,
    // dass es sie gibt und wem sie gehört, damit jemand die Einladung nachholt.
    if (err instanceof FormStepError && err.createdUrl) {
      await record(userId, order, err.createdUrl);
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
  kind: 'created' | 'connected';
  created_at: Date;
}

/** Die Seiten, die die Person angelegt oder verbunden hat — nur auf ihnen stellt der Grünerator Anträge ein. */
export async function hostedSitesOf(userId: string): Promise<HostedSite[]> {
  return (await getPostgresInstance().query(
    `SELECT id, subdomain, title, url, kind, created_at FROM antragsgruen_hosted_sites
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
  const client = botClient();
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
  if (!config) throw new OrderRefused('Antragsgrün ist hier nicht eingerichtet.');
  // Erneut gegen die Datenbank, nicht gegen die Karte: zwischen Karte und Klick
  // kann die Seite den Besitz gewechselt haben.
  const site = (await hostedSitesOf(userId)).find((s) => s.subdomain === order.subdomain);
  if (!site)
    throw new OrderRefused(
      'Diese Antragsgrün-Seite ist nicht mit deinem Grünerator-Konto verbunden.'
    );
  const person = await deliverableContactOf(userId);
  if (!person) throw new OrderRefused('Dein Konto hat keine gültige E-Mail-Adresse.');
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

/** Eine eigene Seite der Person, mit eingeloggtem Grünerator-Konto; beide sind dort noch Admin. */
async function adminSessionOn(userId: string, subdomain: string) {
  const config = hostingConfigFromEnv();
  if (!config) throw new OrderRefused('Antragsgrün ist hier nicht eingerichtet.');
  const site = (await hostedSitesOf(userId)).find((s) => s.subdomain === subdomain);
  if (!site)
    throw new OrderRefused(
      'Diese Antragsgrün-Seite ist nicht mit deinem Grünerator-Konto verbunden.'
    );
  const person = await deliverableContactOf(userId);
  if (!person) throw new OrderRefused('Dein Konto hat keine gültige E-Mail-Adresse.');
  const client = botClient();
  await login(client, config);
  const { origin, consultation } = splitSiteUrl(site.url);
  await requireAdmins(client, origin, consultation, person.email);
  return { client, origin, consultation, site };
}

export type OwnSiteReading =
  | { kind: 'list'; motions: OwnMotionRef[] }
  | { kind: 'motion'; motion: OwnMotion }
  | { kind: 'not-found'; motions: OwnMotionRef[] };

/**
 * Ohne `antrag` die Anträge der Seite (auch ungeprüfte), sonst einen davon mit
 * Zeilennummern. Wie jedes Handeln auf der Seite nur, solange Grünerator-Konto
 * und Person dort Admin sind.
 */
export async function readOwnSite(
  userId: string,
  subdomain: string,
  antrag: string | null
): Promise<OwnSiteReading> {
  const { client, origin, consultation } = await adminSessionOn(userId, subdomain);
  const motions = await listOwnMotions(client, origin, consultation);
  if (!antrag) return { kind: 'list', motions };
  const ref = findOwnMotion(motions, antrag);
  if (!ref) return { kind: 'not-found', motions };
  return { kind: 'motion', motion: await readOwnMotion(client, origin, consultation, ref) };
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

/**
 * Eine Adresse auf dem Antragsgrün-Host des Grünerator-Kontos, z. B.
 * `kv-x.antragsgruen.de/kmv` oder `https://kv-x.antragsgruen.de/`. Nur dieser
 * Host: dort hat das Konto seinen Login, und eine fremde Adresse holt nie ab.
 */
export function parseSiteAddress(
  input: string,
  baseUrl: string
): { subdomain: string; origin: string; consultation: string | null } | null {
  const base = new URL(baseUrl);
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(input.trim())
        ? input.trim()
        : `${base.protocol}//${input.trim()}`
    );
  } catch {
    return null;
  }
  const suffix = `.${base.hostname}`;
  if (url.protocol !== base.protocol || url.port !== base.port || url.username || url.password)
    return null;
  if (!url.hostname.endsWith(suffix)) return null;
  const subdomain = url.hostname.slice(0, -suffix.length);
  // Antragsgrüns eigene Regel (`Site::isSubdomainAvailable`), weiter als unsere fürs Anlegen.
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) return null;
  const first = url.pathname.split('/').filter(Boolean)[0] ?? null;
  // Wie Antragsgrüns Routen (`<consultationPath:[\w_-]+>`).
  const consultation = first && /^[\w-]+$/.test(first) ? first : null;
  return { subdomain, origin: url.origin, consultation };
}

/**
 * Verbindet eine Seite, die die Person selbst angelegt hat. Vorher hat sie das
 * Grünerator-Konto dort als Seiten-Admin eingetragen. Geprüft wird beides:
 * das Grünerator-Konto ist Admin, UND die Person selbst ist es — mit der
 * Adresse ihres Grünerator-Kontos. Ohne die zweite Prüfung könnte jede*r eine
 * Seite verbinden, auf der das Konto schon Admin ist, und dort Anträge stellen.
 */
export async function connectAntragsgruenSite(
  userId: string,
  address: string,
  client: FormClient = botClient()
): Promise<HostedSite> {
  const config = hostingConfigFromEnv();
  if (!config) throw new OrderRefused('Antragsgrün ist hier nicht eingerichtet.');
  const host = new URL(config.baseUrl).hostname;
  const parsed = parseSiteAddress(address, config.baseUrl);
  if (!parsed)
    throw new OrderRefused(
      `Das ist keine Adresse einer Seite auf ${host}, z. B. https://kv-beispiel.${host}/kmv.`
    );
  const db = getPostgresInstance();
  const taken = (await db.query(
    `SELECT user_id FROM antragsgruen_hosted_sites WHERE subdomain = $1`,
    [parsed.subdomain]
  )) as { user_id: string | null }[];
  if (taken[0]) {
    throw new OrderRefused(
      taken[0].user_id === userId
        ? 'Diese Seite ist schon mit deinem Konto verbunden.'
        : 'Diese Seite ist schon mit einem anderen Grünerator-Konto verbunden.'
    );
  }
  const connected = (await db.query(
    `SELECT COUNT(*)::int AS n FROM antragsgruen_hosted_sites WHERE user_id = $1 AND kind = 'connected'`,
    [userId]
  )) as { n: number }[];
  if ((connected[0]?.n ?? 0) >= MAX_CONNECTED_SITES_PER_USER) {
    throw new OrderRefused(
      `Du hast schon ${MAX_CONNECTED_SITES_PER_USER} Antragsgrün-Seiten verbunden.`
    );
  }
  const person = await deliverableContactOf(userId);
  if (!person) throw new OrderRefused('Dein Konto hat keine gültige E-Mail-Adresse.');

  await login(client, config);
  // Ohne Pfad zeigt die Subdomain die Standard-Veranstaltung direkt an (gemessen,
  // keine Weiterleitung). Der Assistent legt sie unter dem Namen der Subdomain an.
  const consultation = parsed.consultation ?? parsed.subdomain;
  const url = `${parsed.origin}/${consultation}`;
  const start = await client.request(url);
  const title = cheerio.load(start.html)('h1').first().text().replace(/\s+/g, ' ').trim();
  if (start.status !== 200 || !title) {
    throw new OrderRefused(
      `Unter ${url} gibt es keine Veranstaltung. Füge die Adresse ein, unter der deine Veranstaltung erscheint, z. B. https://${parsed.subdomain}.${host}/kmv.`
    );
  }
  try {
    await requireAdmins(client, parsed.origin, consultation, person.email);
  } catch (err) {
    if (!(err instanceof FormStepError)) throw err;
    if (err.step === 'revoked')
      throw new OrderRefused(
        `Das Grünerator-Konto ${config.botEmail} ist auf dieser Seite nicht Admin. Trag es unter „Einstellungen → Registrierte Benutzer*innen" in die Gruppe „Seiten-Admin" ein.`
      );
    if (err.step === 'not-admin')
      throw new OrderRefused(
        `Dein Grünerator-Konto (${person.email}) ist auf dieser Seite nicht Admin. Verbinden kann nur, wer dort mit derselben Adresse Admin ist.`
      );
    throw err;
  }

  const rows = (await db.query(
    `INSERT INTO antragsgruen_hosted_sites (user_id, subdomain, title, url, kind)
     VALUES ($1, $2, $3, $4, 'connected')
     ON CONFLICT (subdomain) DO NOTHING
     RETURNING id, subdomain, title, url, kind, created_at`,
    [userId, parsed.subdomain, title, url]
  )) as HostedSite[];
  if (!rows[0]) throw new OrderRefused('Diese Seite wurde gerade schon verbunden.');
  return rows[0];
}
