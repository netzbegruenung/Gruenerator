/**
 * nuudel-Umfragen im Chat: `nuudel_umfrage_anlegen` (Terminfindung oder
 * Auswahl) und `nuudel_umfrage_lesen` (Ergebnis einer eigenen Umfrage).
 *
 * Bestätigt wird wie bei einem Konnektor: `nuudel_umfrage_anlegen` steht in
 * `INTERNAL_APPROVAL_REQUIRED_TOOLS` (`approvalPolicy.ts`), der Loop hält vor
 * dem Aufruf an und die Person sieht die Argumente — einmal erlauben, immer
 * erlauben oder ablehnen. Läuft `execute`, ist die Freigabe schon erteilt.
 * Das Lesen ändert nichts und fragt nicht.
 *
 * Beide liegen hinter der Gruppe `nuudel` (`toolScope.ts`). Ablauf und
 * Formulierungen: Rezept „nuudel". Das Modell lädt es im Loop selten von
 * selbst (live gemessen 19.11.2026: in 15 Turns nie), deshalb stehen die
 * Regeln, ohne die eine Umfrage schief angelegt wird, in der Beschreibung.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { berlinDay } from '../../../services/briefing/time.js';
import { nuudelBaseUrl } from '../../../services/nuudel/client.js';
import {
  orderNuudelPoll,
  pickPoll,
  pollsOf,
  readOwnPollResults,
  type OwnPoll,
  type PollOrder,
} from '../../../services/nuudel/polls.js';
import { FormStepError, OrderRefused } from '../../../services/webForms/formClient.js';
import { createLogger } from '../../../utils/logger.js';

import {
  NO_SESSION,
  groundNote,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

const log = createLogger('nuudelTools');

export const NUUDEL_CREATE_TOOL = 'nuudel_umfrage_anlegen';
export const NUUDEL_READ_TOOL = 'nuudel_umfrage_lesen';

const ISO_DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'kein gültiges Datum');

const CREATE_FIELDS = z.object({
  art: z
    .enum(['termin', 'auswahl'])
    .describe('„termin" = Terminfindung (Tage, optional Uhrzeiten); „auswahl" = freie Optionen'),
  titel: z.string().trim().min(3).max(120),
  beschreibung: z.string().trim().max(1000).optional(),
  termine: z
    .array(
      z.object({
        tag: ISO_DAY.describe('„YYYY-MM-DD"'),
        uhrzeiten: z
          .array(z.string().trim().min(1).max(30))
          .max(10)
          .optional()
          .describe(
            'z. B. ["18:00", "19:30"]; eine Zeitspanne bleibt EIN Eintrag ("10–16 Uhr"); weglassen = ganzer Tag'
          ),
      })
    )
    .min(1)
    .max(30)
    .optional()
    .describe('Nur bei art="termin"'),
  optionen: z
    .array(z.string().trim().min(1).max(200))
    .min(2)
    .max(30)
    .optional()
    .describe('Nur bei art="auswahl"'),
  ende: ISO_DAY.optional().describe(
    'Optional: Tag, an dem nuudel die Umfrage löscht; ohne Angabe nuudels Vorgabe'
  ),
});

type CreateInput = z.infer<typeof CREATE_FIELDS>;

/**
 * Das Eingabeschema mit dem heutigen Tag. Vergangene Tage scheitern hier und
 * nicht erst in `execute`: das SDK prüft die Eingabe VOR `execute`, und dort
 * sitzt das Freigabe-Gate (`wrapTools.ts`). Sonst bekäme die Person eine
 * Umfrage zur Freigabe, die danach doch abgelehnt wird; so sieht das Modell
 * den Fehler und fragt nach (live 19.11.2026: „3. und 5. November" ging bis
 * ans Gate).
 */
export function createInputSchema(today: string = berlinDay(new Date())) {
  return CREATE_FIELDS.superRefine((args, ctx) => {
    const past = (args.termine ?? []).map((t) => t.tag).filter((d) => d < today);
    if (past.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['termine'],
        message: `Diese Termine liegen in der Vergangenheit (heute ist ${today}): ${past.join(', ')}. Frag die Person, welche Tage gemeint sind.`,
      });
    }
    if (args.ende && args.ende < today) {
      ctx.addIssue({
        code: 'custom',
        path: ['ende'],
        message: `Das Ablaufdatum ${args.ende} liegt in der Vergangenheit (heute ist ${today}).`,
      });
    }
  });
}

export function toOrder(args: CreateInput): PollOrder | { error: string } {
  const base = {
    title: args.titel,
    description: args.beschreibung?.trim() || null,
    endDate: args.ende ?? null,
  };
  if (args.art === 'termin') {
    if (!args.termine?.length) return { error: 'Für eine Terminfindung fehlen die Termine.' };
    const days = [...args.termine]
      .sort((a, b) => a.tag.localeCompare(b.tag))
      .map((t) => ({ day: t.tag, times: t.uhrzeiten ?? [] }));
    return { ...base, kind: 'date', days };
  }
  if (!args.optionen || args.optionen.length < 2) {
    return { error: 'Für eine Auswahl braucht es mindestens zwei Optionen.' };
  }
  return { ...base, kind: 'classic', options: args.optionen };
}

const describePoll = (p: OwnPoll) => ({
  titel: p.title,
  art: p.kind === 'date' ? 'termin' : 'auswahl',
  teilnahme_link: p.pollUrl,
  admin_link: p.adminUrl,
  angelegt: p.createdAt.toISOString().slice(0, 10),
});

export function makeNuudelCreateTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Legt eine Umfrage auf nuudel.digitalcourage.de an (Dienst von Digitalcourage e.V., wie Doodle ohne Tracking): eine Terminfindung („Wann können alle?") oder eine Auswahl zwischen Optionen. Die Person wird mit Name und E-Mail-Adresse ihres Kontos als Ersteller*in eingetragen; nuudel schickt ihr Teilnahme- und Admin-Link.

NUTZE, wenn die Person für eine Gruppe eine Terminabstimmung (wie Doodle) oder eine eigene Abstimmung erstellt haben will. NICHT für Wahl- oder Meinungsumfragen (dafür 'umfragen'). Termine immer als „YYYY-MM-DD" (heute ist ${berlinDay(new Date())}); relative Angaben („nächster Dienstag") rechnest du selbst um.

REGELN:
- Den Titel schlägst du selbst vor, frag nie danach. Fehlen nur die Termine bzw. Optionen, frag in EINER kurzen Frage genau danach, ohne Liste weiterer Angaben.
- Optionen und Uhrzeiten übernimmst du wörtlich, ohne Zusätze. „beschreibung" nur mit dem, was die Person gesagt oder eingefügt hat (Ort, Tagesordnung); sonst weglassen.
- Liegt ein genannter Tag vor heute, ruf nicht auf, sondern frag nach, welcher gemeint ist.
- Sind Titel und Termine bzw. Optionen klar, ruf das Werkzeug SOFORT auf, mit einem Satz davor, was angelegt wird. Frag NICHT „Soll ich das so anlegen?": die Oberfläche zeigt der Person den Aufruf mit allen Angaben, und sie erlaubt oder lehnt ihn ab. Vorher ist nichts angelegt und es gibt keinen Link. Nie nach der E-Mail-Adresse fragen.
- Danach: Teilnahme-Link zum Weiterschicken, Admin-Link nur für die Person (bearbeiten, auswerten, löschen); nuudel schickt beide auch per Mail; die Funktion ist experimentell.
Mehr dazu: Rezept „nuudel" (über rezept_laden).`,
    inputSchema: createInputSchema(),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      const order = toOrder(args);
      if ('error' in order) return order;
      try {
        const poll = await orderNuudelPoll(userId, order);
        const note = `Umfrage „${poll.title}" auf nuudel angelegt. Teilnahme-Link: ${poll.pollUrl}. Admin-Link (nur für die Person, zum Bearbeiten und Auswerten): ${poll.adminUrl}.`;
        groundNote(sourceRegistry, 'nuudel-Umfrage angelegt', note);
        return { ok: true, ...describePoll(poll), note };
      } catch (err) {
        if (err instanceof OrderRefused) return { error: err.userText };
        if (err instanceof FormStepError) {
          log.warn(`[nuudel-create] step=${err.step}: ${err.message}`);
          return {
            error: err.createdUrl
              ? `Die Umfrage steht unter ${err.createdUrl}, aber nuudel hat anders geantwortet als erwartet. Die Person soll den Link prüfen.`
              : `nuudel hat die Umfrage nicht angenommen (${err.message}). Nichts ist angelegt.`,
          };
        }
        log.warn(`[nuudel-create] failed: ${err instanceof Error ? err.message : String(err)}`);
        return { error: 'nuudel ist gerade nicht erreichbar. Nichts ist angelegt.' };
      }
    },
  });
}

/** Mehr Zeilen braucht kein „wer kann wann?"; die Summen je Option zählen alle. */
const MAX_PARTICIPANT_ROWS = 50;

export function makeNuudelReadTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Liest das Ergebnis einer nuudel-Umfrage, die der Grünerator für die Person angelegt hat: je Termin bzw. Option die Zahl der Ja-, Vorbehalt- und Nein-Stimmen und wer wie abgestimmt hat. Ohne „umfrage" die jüngste; die Antwort listet alle eigenen Umfragen mit.

NUTZE, wenn die Person wissen will, wie eine ihrer Umfragen steht oder welcher Termin passt, auch wenn sie einen nuudel-Link schickt. Fremde nuudel-Umfragen kann es nicht lesen; das Ergebnis sagt es dann.

Antwort: Termin bzw. Option mit den meisten Ja-Stimmen; bei Gleichstand alle gleichauf liegenden, Vorbehalt-Stimmen als zweites Kriterium; dazu die Zahl der Teilnehmenden.`,
    inputSchema: z.object({
      umfrage: z
        .string()
        .max(300)
        .optional()
        .describe('Titel (Teilstück reicht) oder Teilnahme-Link; weglassen = die jüngste'),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const polls = await pollsOf(userId);
      const foreign = foreignPollRef(polls, args.umfrage ?? null);
      if (foreign) {
        return {
          error: `${foreign} ist keine Umfrage, die der Grünerator für die Person angelegt hat. Fremde nuudel-Umfragen kann er nicht lesen; die Person sieht das Ergebnis auf der Seite selbst oder kopiert es hier hinein.`,
          ...(polls.length > 0
            ? { alle: polls.map((p) => ({ titel: p.title, teilnahme_link: p.pollUrl })) }
            : {}),
        };
      }
      if (polls.length === 0) {
        return {
          error: 'Die Person hat noch keine nuudel-Umfrage über den Grünerator angelegt.',
        };
      }
      const alle = polls.map((p) => ({ titel: p.title, teilnahme_link: p.pollUrl }));
      const poll = pickPoll(polls, args.umfrage ?? null);
      if (!poll) return { error: `Keine eigene Umfrage passt zu „${args.umfrage}".`, alle };
      try {
        const results = await readOwnPollResults(userId, poll);
        const best = Math.max(0, ...results.options.map((o) => o.yes));
        groundNote(
          sourceRegistry,
          `nuudel-Umfrage „${poll.title}"`,
          results.options
            .map((o) => `${o.label}: ${o.yes} ja, ${o.maybe} vorbehaltlich, ${o.no} nein`)
            .join('\n')
        );
        return {
          ...describePoll(poll),
          teilnehmende: results.participants.length,
          optionen: results.options.map((o) => ({
            ...o,
            ...(best > 0 && o.yes === best ? { meiste_ja: true } : {}),
          })),
          stimmen: results.participants.slice(0, MAX_PARTICIPANT_ROWS).map((p) => ({
            name: p.name,
            antworten: p.answers.map((a, i) => `${results.options[i]?.label}: ${a ?? '–'}`),
          })),
          alle,
        };
      } catch (err) {
        if (err instanceof OrderRefused) return { error: err.userText };
        if (err instanceof FormStepError && err.step === 'gone') {
          return {
            error: `Die Umfrage „${poll.title}" gibt es bei nuudel nicht mehr (gelöscht oder abgelaufen).`,
            alle,
          };
        }
        log.warn(`[nuudel-read] failed: ${err instanceof Error ? err.message : String(err)}`);
        return { error: 'nuudel ist gerade nicht erreichbar.', alle };
      }
    },
  });
}

/** Ein nuudel-Link, der zu keiner eigenen Umfrage gehört, oder null. */
export function foreignPollRef(polls: OwnPoll[], ref: string | null): string | null {
  const link = ref?.match(/https?:\/\/\S*nuudel\S*/i)?.[0] ?? null;
  if (!link) return null;
  return pickPoll(polls, link) ? null : link;
}

/** Montiert nur, solange nuudel nicht abgeschaltet ist (`NUUDEL_URL`). */
export function nuudelConfigured(): boolean {
  return nuudelBaseUrl() !== null;
}
