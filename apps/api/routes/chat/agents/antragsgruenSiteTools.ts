/**
 * `antragsgruen_seite_anlegen`: eine eigene Antragsgrün-Seite auf
 * antragsgruen.de für die Person anlegen (Parteitag, KMV, Mitgliederversammlung).
 *
 * Das Werkzeug prüft nur die Adresse und zeigt eine Karte; angelegt wird erst
 * nach dem Klick (`confirmController` → `services/antragsgruen/hosting/`).
 * Eingeladen wird die Person selbst, mit der Adresse ihres Kontos — das
 * Werkzeug nimmt keine E-Mail-Adresse entgegen.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { type AgendaItemRef } from '../../../services/antragsgruen/hosting/agenda.js';
import {
  SUBDOMAIN_RE,
  isSubdomainAvailable,
} from '../../../services/antragsgruen/hosting/createSite.js';
import { hostingConfigFromEnv } from '../../../services/antragsgruen/hosting/session.js';
import {
  MAX_SITES_PER_USER,
  hostedSitesOf,
  readAntragsgruenAgenda,
  readOwnSite,
  sitesOrderedBy,
  type HostedSite,
  type OwnSiteReading,
} from '../../../services/antragsgruen/hosting/sites.js';
import { deliverableContactOf } from '../../../services/user/accountContact.js';
import { FormStepError, FormClient } from '../../../services/webForms/formClient.js';
import { createLogger } from '../../../utils/logger.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import {
  NO_SESSION,
  groundNote,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('antragsgruenSiteTools');

export const ANTRAGSGRUEN_SITE_TOOL = 'antragsgruen_seite_anlegen';

/** Ein Tagesordnungspunkt im Werkzeug; `toAgenda` macht daraus den Eintrag für Antragsgrün. */
const AGENDA_ITEM = z.object({
  code: z.string().max(20).optional().describe('z. B. „1." oder „TOP 3"'),
  titel: z.string().min(1).max(250),
  uhrzeit: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional()
    .describe('„HH:MM"'),
  antraege: z
    .boolean()
    .optional()
    .describe(
      'true, wenn unter diesem Punkt Anträge eingereicht werden (z. B. „Anträge", „Satzung")'
    ),
});
const AGENDA = z.array(AGENDA_ITEM).min(1).max(40);

function toAgenda(items: z.infer<typeof AGENDA>) {
  // Ohne jeden Code nummeriert der Grünerator selbst: so steht auf der Seite, was
  // die Person sagt („TOP 3"), und ein Antrag findet seinen Punkt über den Code.
  const numbered = items.every((i) => !i.code?.trim());
  return items.map((i, n) => ({
    code: numbered ? `${n + 1}.` : i.code?.trim() || null,
    title: i.titel.trim(),
    time: i.uhrzeit ?? null,
    motions: i.antraege === true,
  }));
}

const agendaLine = (items: ReturnType<typeof toAgenda>) =>
  items
    .map((i) => `${i.code ? `${i.code} ` : ''}${i.title}${i.motions ? ' (Anträge)' : ''}`)
    .join(' · ');

export interface SiteToolDeps {
  /** Host, unter dem die Seiten liegen (`antragsgruen.de`; lokal die Testinstanz). */
  host: string;
  isAvailable: (subdomain: string) => Promise<boolean>;
  sitesOrderedBy: (userId: string) => Promise<number>;
  hasInviteeEmail: (userId: string) => Promise<boolean>;
}

/** Ohne Zugangsdaten des Grünerator-Kontos wird das Werkzeug nicht montiert. */
export function siteCreationConfigured(): boolean {
  return hostingConfigFromEnv() !== null;
}

function defaultDeps(): SiteToolDeps {
  const config = hostingConfigFromEnv();
  return {
    host: config ? new URL(config.baseUrl).host : 'antragsgruen.de',
    isAvailable: (subdomain) =>
      config ? isSubdomainAvailable(new FormClient(), config, subdomain) : Promise.resolve(false),
    sitesOrderedBy,
    hasInviteeEmail: async (userId) => (await deliverableContactOf(userId)) !== null,
  };
}

export function makeAntragsgruenSiteTool(
  ctx: PersonalToolCtx,
  deps: SiteToolDeps = defaultDeps()
): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  return tool({
    description: `Legt eine eigene Antragsgrün-Seite auf antragsgruen.de an — für einen Parteitag, eine Kreismitgliederversammlung oder eine andere Versammlung, auf der Anträge und Änderungsanträge gestellt werden. Die Person wird mit der E-Mail-Adresse ihres Grünerator-Kontos als Seiten-Admin eingetragen; Antragsgrün schickt ihr die Zugangsdaten.

NUTZE NUR, wenn die Person ausdrücklich eine Antragsgrün-Seite (bzw. ein „Antragsgrün" oder Antragstool) für ihre Versammlung angelegt haben will. NICHT für Fragen zu bestehenden Anträgen (dafür 'antragsgruen').

Frage vorher nach, was fehlt: Titel der Versammlung, Name der Gliederung (z. B. „GRÜNE KV Köln") und die gewünschte Adresse. Die Adresse (subdomain) ist klein geschrieben, 3–40 Zeichen, nur a–z, 0–9 und Bindestrich, z. B. „kv-koeln-kmv27" — Umlaute umschreiben. Das Werkzeug zeigt eine Karte zur Bestätigung; kündige nichts als angelegt an, solange die Person nicht bestätigt hat.

Ablauf, Fehlerfälle und die nächsten Schritte danach: Rezept „antragsgruen-seite" (über rezept_laden).`,
    inputSchema: z.object({
      title: z.string().min(3).max(120).describe('Titel der Versammlung, z. B. „KMV Köln 2027"'),
      organization: z.string().min(2).max(120).describe('Gliederung, z. B. „GRÜNE KV Köln"'),
      subdomain: z.string().describe('Adresse: <subdomain>.antragsgruen.de'),
      tagesordnung: AGENDA.optional().describe(
        'Optional: die Tagesordnung, wenn die Person sie schon kennt; sonst weglassen'
      ),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      if (!threadId) return { error: 'Anlegen ist in diesem Kontext nicht möglich.' };

      const subdomain = args.subdomain.trim().toLowerCase();
      if (!SUBDOMAIN_RE.test(subdomain)) {
        return {
          error: `„${args.subdomain}" geht nicht als Adresse: 3–40 Zeichen, nur a–z, 0–9 und Bindestrich, vorne kein Bindestrich.`,
        };
      }
      if ((await deps.sitesOrderedBy(userId)) >= MAX_SITES_PER_USER) {
        return {
          error: `Die Person hat schon ${MAX_SITES_PER_USER} Antragsgrün-Seiten über den Grünerator angelegt; mehr gehen nicht.`,
        };
      }
      if (!(await deps.hasInviteeEmail(userId))) {
        return {
          error:
            'Das Konto der Person hat keine gültige E-Mail-Adresse, an die Antragsgrün einladen könnte.',
        };
      }
      let available: boolean;
      try {
        available = await deps.isAvailable(subdomain);
      } catch (err) {
        log.warn(`check-subdomain failed: ${err instanceof Error ? err.message : String(err)}`);
        return {
          error: 'antragsgruen.de ist gerade nicht erreichbar. Später noch einmal versuchen.',
        };
      }
      if (!available) {
        return {
          error: `Die Adresse „${subdomain}.${deps.host}" ist schon vergeben. Schlage eine andere vor.`,
        };
      }

      const agenda = args.tagesordnung ? toAgenda(args.tagesordnung) : null;
      const payload = {
        title: args.title.trim(),
        organization: args.organization.trim(),
        subdomain,
        agenda,
      };
      const pending: PendingAction = {
        actionId: newActionId(),
        threadId,
        userId,
        title: 'Antragsgrün-Seite anlegen (Experimentell)',
        preview: `„${payload.title}" unter ${subdomain}.${deps.host} anlegen`,
        createdAt: Date.now(),
        type: 'create_antragsgruen_site',
        payload,
      };
      await emitToolConfirmAction(sse, pending, [
        { key: 'Titel', value: payload.title },
        { key: 'Gliederung', value: payload.organization },
        { key: 'Adresse', value: `${subdomain}.${deps.host}` },
        ...(agenda ? [{ key: 'Tagesordnung', value: agendaLine(agenda) }] : []),
      ]);
      const note = `Bestätigung zum Anlegen der Antragsgrün-Seite „${payload.title}" (${subdomain}.${deps.host}) angefordert. Erst nach dem Klick auf „Anlegen" entsteht die Seite.`;
      groundNote(sourceRegistry, 'Antragsgrün-Seite anlegen', note);
      return { ok: true, note };
    },
  });
}

/**
 * Die Seite, auf der ein Werkzeug handeln soll: die genannte, sonst die einzige.
 * Sonst ein Fehler, der dem Modell sagt, was es fragen oder sagen soll.
 */
export function pickSite(
  sites: readonly HostedSite[],
  seite: string | undefined
): { site: HostedSite } | { error: string } {
  if (sites.length === 0) {
    return {
      error:
        'Die Person hat noch keine Antragsgrün-Seite über den Grünerator angelegt oder verbunden. Eine eigene bestehende Seite verbindet sie in den Einstellungen unter „Antragsgrün"; auf anderen Seiten kann der Grünerator nichts tun.',
    };
  }
  const wanted = seite?.trim().toLowerCase();
  const site = wanted
    ? sites.find((s) => s.subdomain === wanted)
    : sites.length === 1
      ? sites[0]
      : undefined;
  if (site) return { site };
  const list = sites.map((s) => `${s.subdomain} („${s.title}")`).join(', ');
  return {
    error: wanted
      ? `„${wanted}" ist keine Seite der Person. Ihre Seiten: ${list}.`
      : `Die Person hat mehrere Seiten — frag, auf welche: ${list}.`,
  };
}

export const ANTRAGSGRUEN_MOTION_TOOL = 'antragsgruen_antrag_stellen';

/** Antrags- und Begründungstext zusammen; darüber wird es kein Antrag mehr, sondern ein Programm. */
const MAX_MOTION_CHARS = 30_000;

export interface MotionToolDeps {
  sitesOf: (userId: string) => Promise<HostedSite[]>;
}

export function makeAntragsgruenMotionTool(
  ctx: PersonalToolCtx,
  deps: MotionToolDeps = { sitesOf: hostedSitesOf }
): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  return tool({
    description: `Reicht einen Antrag auf einer eigenen Antragsgrün-Seite der Person ein — angelegt über den Grünerator (antragsgruen_seite_anlegen) oder in den Einstellungen unter „Antragsgrün" verbunden. Die Person steht als Antragsteller*in drin; der Antrag ist danach „Eingereicht (ungeprüft)" und wird erst nach Freischaltung durch die Admins öffentlich.

NUTZE NUR, wenn die Person ausdrücklich will, dass ein Antrag bei Antragsgrün eingereicht wird — nicht, um einen Antrag nur zu schreiben. Schreib den Antrag vorher fertig und lass ihn bestätigen; übergib Titel, Antragstext (Markdown) und optional die Begründung. Auf fremden Antragsgrün-Seiten (z. B. der LDK) kann der Grünerator nichts einreichen.

Das Werkzeug zeigt eine Karte zur Bestätigung; kündige nichts als eingereicht an, solange die Person nicht bestätigt hat.`,
    inputSchema: z.object({
      seite: z
        .string()
        .optional()
        .describe('Adresse (Subdomain) der eigenen Seite; weglassen, wenn die Person nur eine hat'),
      titel: z.string().min(3).max(300),
      antragstext: z.string().min(20).describe('Antragstext als Markdown, ohne Titel'),
      begruendung: z.string().optional().describe('Begründung als Markdown'),
      organisation: z
        .string()
        .optional()
        .describe(
          'Nur wenn eine Gliederung statt der Person den Antrag stellt, z. B. „GRÜNE OV Ehrenfeld"'
        ),
      top: z
        .string()
        .optional()
        .describe(
          'Tagesordnungspunkt, unter dem der Antrag läuft — Code („3") oder Titel; ohne Tagesordnung weglassen'
        ),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      if (!threadId) return { error: 'Einreichen ist in diesem Kontext nicht möglich.' };

      const picked = pickSite(await deps.sitesOf(userId), args.seite);
      if ('error' in picked) return picked;
      const { site } = picked;
      const text = args.antragstext.trim();
      const reason = args.begruendung?.trim() || null;
      if (text.length + (reason?.length ?? 0) > MAX_MOTION_CHARS) {
        return {
          error: `Antrag und Begründung sind zusammen länger als ${MAX_MOTION_CHARS} Zeichen.`,
        };
      }

      const payload = {
        subdomain: site.subdomain,
        title: args.titel.trim(),
        text,
        reason,
        organization: args.organisation?.trim() || null,
        agendaItem: args.top?.trim() || null,
      };
      const pending: PendingAction = {
        actionId: newActionId(),
        threadId,
        userId,
        title: 'Antrag bei Antragsgrün einreichen (Experimentell)',
        preview: `„${payload.title}" auf ${site.title} einreichen`,
        createdAt: Date.now(),
        type: 'create_antragsgruen_motion',
        payload,
      };
      await emitToolConfirmAction(sse, pending, [
        { key: 'Antrag', value: payload.title },
        { key: 'Seite', value: site.title },
        ...(payload.organization ? [{ key: 'Antragsteller*in', value: payload.organization }] : []),
        ...(payload.agendaItem ? [{ key: 'TOP', value: payload.agendaItem }] : []),
      ]);
      const note = `Bestätigung zum Einreichen des Antrags „${payload.title}" auf „${site.title}" angefordert. Erst nach dem Klick auf „Einreichen" steht er bei Antragsgrün.`;
      groundNote(sourceRegistry, 'Antrag einreichen', note);
      return { ok: true, note };
    },
  });
}

export const ANTRAGSGRUEN_AGENDA_TOOL = 'antragsgruen_tagesordnung';

export interface AgendaToolDeps {
  sitesOf: (userId: string) => Promise<HostedSite[]>;
  readAgenda: (userId: string, subdomain: string) => Promise<AgendaItemRef[]>;
}

export function makeAntragsgruenAgendaTool(
  ctx: PersonalToolCtx,
  deps: AgendaToolDeps = { sitesOf: hostedSitesOf, readAgenda: readAntragsgruenAgenda }
): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  return tool({
    description: `Liest oder setzt die Tagesordnung einer eigenen Antragsgrün-Seite der Person (über den Grünerator angelegt oder in den Einstellungen verbunden).

Ohne „punkte": liefert die aktuelle Tagesordnung. Mit „punkte": ersetzt die GANZE Tagesordnung durch diese Liste (Karte zur Bestätigung) — wer nur einen Punkt ergänzen oder ändern will, liest zuerst und übergibt dann die vollständige neue Liste. Punkte mit gleichem Code oder Titel behalten ihre Anträge; fehlende Punkte werden gelöscht. Markiere mit „antraege: true" die Punkte, unter denen Anträge eingereicht werden.`,
    inputSchema: z.object({
      seite: z
        .string()
        .optional()
        .describe('Adresse (Subdomain); weglassen, wenn die Person nur eine Seite hat'),
      punkte: AGENDA.optional(),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const picked = pickSite(await deps.sitesOf(userId), args.seite);
      if ('error' in picked) return picked;
      const { site } = picked;

      if (!args.punkte) {
        try {
          const items = await deps.readAgenda(userId, site.subdomain);
          const text = items.length
            ? items.map((i) => `${i.code ? `${i.code} ` : ''}${i.title}`).join('\n')
            : '(keine Tagesordnung)';
          groundNote(sourceRegistry, `Tagesordnung „${site.title}"`, text);
          return {
            seite: site.subdomain,
            punkte: items.map((i) => ({ code: i.code, titel: i.title })),
          };
        } catch (err) {
          log.warn(`agenda read failed: ${err instanceof Error ? err.message : String(err)}`);
          return {
            error:
              err instanceof FormStepError && err.step === 'revoked'
                ? 'Der Grünerator ist auf dieser Seite nicht mehr Admin.'
                : err instanceof FormStepError && err.step === 'not-admin'
                  ? 'Die Person ist auf dieser Seite nicht mehr Admin; der Grünerator handelt dort nicht mehr für sie.'
                  : 'Die Tagesordnung ist gerade nicht abrufbar.',
          };
        }
      }

      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      if (!threadId) return { error: 'Ändern ist in diesem Kontext nicht möglich.' };
      const entries = toAgenda(args.punkte);
      const pending: PendingAction = {
        actionId: newActionId(),
        threadId,
        userId,
        title: 'Tagesordnung bei Antragsgrün setzen (Experimentell)',
        preview: `${entries.length} Punkte für „${site.title}"`,
        createdAt: Date.now(),
        type: 'set_antragsgruen_agenda',
        payload: { subdomain: site.subdomain, entries },
      };
      await emitToolConfirmAction(sse, pending, [
        { key: 'Seite', value: site.title },
        { key: 'Tagesordnung', value: agendaLine(entries) },
      ]);
      const note = `Bestätigung zum Setzen der Tagesordnung (${entries.length} Punkte) auf „${site.title}" angefordert.`;
      groundNote(sourceRegistry, 'Tagesordnung setzen', note);
      return { ok: true, note };
    },
  });
}

export const ANTRAGSGRUEN_READ_TOOL = 'antragsgruen_seite_lesen';

/**
 * Darüber kürzt das Werkzeug selbst; ein Parteitagsantrag hat selten mehr. Die
 * Schleife gibt ihm dafür das Budget (`OWN_CAP_TOOLS` in `toolResultBudgets.ts`).
 */
export const ANTRAGSGRUEN_READ_CHARS = 20_000;

export interface ReadToolDeps {
  sitesOf: (userId: string) => Promise<HostedSite[]>;
  read: (userId: string, subdomain: string, antrag: string | null) => Promise<OwnSiteReading>;
}

const motionLabel = (m: { prefix: string | null; title: string }) =>
  m.prefix ? `${m.prefix} ${m.title}` : m.title;

export function makeAntragsgruenReadTool(
  ctx: PersonalToolCtx,
  deps: ReadToolDeps = { sitesOf: hostedSitesOf, read: readOwnSite }
): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Liest die Anträge einer eigenen Antragsgrün-Seite der Person (über den Grünerator angelegt oder in den Einstellungen verbunden), auch noch nicht freigeschaltete.

Ohne „antrag": die Liste der Anträge mit Nummer, Titel und Status. Mit „antrag" (Nummer wie „A1" oder Titel): der Antragstext Zeile für Zeile, jede Zeile mit ihrer Nummer („[Z. 3] …"), genau wie die Versammlung ihn sieht. Nenne in einem Änderungsantrag die Zeile, in der die Stelle tatsächlich steht.

Für Änderungsanträge: lies den Antrag, schreib den Änderungsantrag mit den richtigen Zeilen („In Zeile 5 ersetze …", „Nach Zeile 9 einfügen: …") und gib der Person den Link zum Formular (aenderungsantrag_formular). Einreichen kann der Grünerator Änderungsanträge nicht — Antragsgrün bietet dafür keine Schnittstelle. Für Parteitage der GRÜNEN NRW ist 'antragsgruen_lesen' da, nicht dieses Werkzeug.`,
    inputSchema: z.object({
      seite: z
        .string()
        .optional()
        .describe('Adresse (Subdomain); weglassen, wenn die Person nur eine Seite hat'),
      antrag: z
        .string()
        .optional()
        .describe('Antragsnummer („A1") oder Titel; weglassen für die Liste'),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const picked = pickSite(await deps.sitesOf(userId), args.seite);
      if ('error' in picked) return picked;
      const { site } = picked;
      let reading: OwnSiteReading;
      try {
        reading = await deps.read(userId, site.subdomain, args.antrag?.trim() || null);
      } catch (err) {
        log.warn(`site read failed: ${err instanceof Error ? err.message : String(err)}`);
        const step = err instanceof FormStepError ? err.step : null;
        return {
          error:
            step === 'revoked'
              ? 'Der Grünerator ist auf dieser Seite nicht mehr Admin.'
              : step === 'not-admin'
                ? 'Die Person ist auf dieser Seite nicht mehr Admin; der Grünerator handelt dort nicht mehr für sie.'
                : 'Die Anträge der Seite sind gerade nicht abrufbar.',
        };
      }
      if (reading.kind === 'list') {
        return {
          seite: site.subdomain,
          antraege: reading.motions.map((m) => ({
            nummer: m.prefix,
            titel: m.title,
            status: m.status,
          })),
        };
      }
      if (reading.kind === 'not-found') {
        const list = reading.motions.map(motionLabel).join('; ');
        return {
          error: `Kein eindeutiger Antrag „${args.antrag}" auf ${site.subdomain}. ${list ? `Vorhanden: ${list}.` : 'Die Seite hat noch keine Anträge.'}`,
        };
      }
      const { motion } = reading;
      const full = motion.sections.map((sec) => `## ${sec.title}\n\n${sec.text}`).join('\n\n');
      const text =
        full.length > ANTRAGSGRUEN_READ_CHARS
          ? `${full.slice(0, ANTRAGSGRUEN_READ_CHARS)}\n\n[… gekürzt]`
          : full;
      groundNote(sourceRegistry, `Antrag „${motionLabel(motion)}" (${site.title})`, text);
      return {
        seite: site.subdomain,
        nummer: motion.prefix,
        titel: motion.title,
        status: motion.status,
        url: motion.url,
        zeilennummern: motion.lineNumbers,
        ...(!motion.lineNumbers && {
          hinweis: 'Die Seite zeigt keine Zeilennummern; nenne Stellen über den Wortlaut.',
        }),
        text,
        aenderungsantrag_formular: motion.amendmentFormUrl,
      };
    },
  });
}
