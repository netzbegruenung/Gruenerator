/**
 * nuudel-Umfragen im Chat: `nuudel_umfrage_anlegen` (Terminfindung oder
 * Auswahl), `nuudel_umfrage_lesen` (Ergebnis einer eigenen Umfrage),
 * `nuudel_umfrage_bearbeiten` (Titel, Beschreibung, Ablauf, Termine) und
 * `nuudel_umfrage_loeschen`.
 *
 * Bestätigt wird wie bei einem Konnektor: Anlegen, Bearbeiten und Löschen
 * stehen in `INTERNAL_APPROVAL_REQUIRED_TOOLS` (`approvalPolicy.ts`), der Loop
 * hält vor dem Aufruf an und die Person sieht die Argumente — einmal erlauben,
 * immer erlauben oder ablehnen. Läuft `execute`, ist die Freigabe schon
 * erteilt. Das Lesen ändert nichts und fragt nicht.
 *
 * Beide liegen hinter der Gruppe `nuudel` (`toolScope.ts`). Ablauf und
 * Formulierungen: Rezept „nuudel". Das Modell lädt es im Loop selten von
 * selbst (live gemessen 19.11.2026: in 15 Turns nie), deshalb stehen die
 * Regeln, ohne die eine Umfrage schief angelegt wird, in der Beschreibung.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { berlinDay } from '../../../services/briefing/time.js';
import { nuudelBaseUrl, type PollEdit } from '../../../services/nuudel/client.js';
import {
  deleteOwnPoll,
  editOwnPoll,
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
export const NUUDEL_EDIT_TOOL = 'nuudel_umfrage_bearbeiten';
export const NUUDEL_DELETE_TOOL = 'nuudel_umfrage_loeschen';

/**
 * Hin und zurück statt nur `Date.parse`: das nimmt „2026-02-30" an und macht
 * daraus den 2. März, und nuudel rollt einen unmöglichen Tag ebenso still
 * weiter (gemessen 19.11.2026: 2026-13-45 → 2027-02-14).
 */
export const ISO_DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  }, 'kein gültiges Datum');

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

/** Die eigene Umfrage zu „umfrage", oder die Antwort fürs Modell, warum keine. */
async function resolveOwnPoll(
  userId: string,
  ref: string
): Promise<
  { poll: OwnPoll } | { error: string; alle?: { titel: string; teilnahme_link: string }[] }
> {
  const polls = await pollsOf(userId);
  const alle = polls.map((p) => ({ titel: p.title, teilnahme_link: p.pollUrl }));
  const foreign = foreignPollRef(polls, ref);
  if (foreign) {
    return {
      error: `${foreign} ist keine Umfrage, die der Grünerator für die Person angelegt hat. Fremde nuudel-Umfragen kann er nicht ändern; das geht nur über deren Admin-Link.`,
      ...(polls.length > 0 ? { alle } : {}),
    };
  }
  if (polls.length === 0) {
    return { error: 'Die Person hat noch keine nuudel-Umfrage über den Grünerator angelegt.' };
  }
  const poll = pickPoll(polls, ref);
  return poll ? { poll } : { error: `Keine eigene Umfrage passt zu „${ref}".`, alle };
}

const UMFRAGE_REF = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .describe('Titel (Teilstück reicht) oder Teilnahme-Link der eigenen Umfrage');

const EDIT_FIELDS = z.object({
  umfrage: UMFRAGE_REF,
  titel: z.string().trim().min(3).max(120).optional(),
  beschreibung: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .describe('Ersetzt die ganze Beschreibung; "" leert sie'),
  ende: ISO_DAY.optional().describe('Neuer Ablauftag „YYYY-MM-DD"'),
  termine_hinzufuegen: z
    .array(
      z.object({
        tag: ISO_DAY.describe('„YYYY-MM-DD"'),
        uhrzeiten: z
          .array(z.string().trim().min(1).max(30))
          .max(10)
          .optional()
          .describe('z. B. ["18:00"]; weglassen = ganzer Tag'),
      })
    )
    .max(30)
    .optional()
    .describe('Nur bei Terminumfragen'),
  termine_entfernen: z
    .array(
      z.object({
        tag: ISO_DAY.describe('„YYYY-MM-DD"'),
        uhrzeit: z
          .string()
          .trim()
          .max(30)
          .optional()
          .describe('Wie in der Umfrage eingetragen; weglassen = der ganztägige Termin'),
      })
    )
    .max(30)
    .optional()
    .describe('Nur bei Terminumfragen'),
  stimmen_verwerfen: z
    .boolean()
    .optional()
    .describe(
      'Nur true, wenn die Person ausdrücklich zugestimmt hat, dass Antworten auf entfernte Termine verloren gehen'
    ),
});

type EditInput = z.infer<typeof EDIT_FIELDS>;

/** Wie beim Anlegen: was vor dem Gate scheitern soll, prüft das Schema. */
export function editInputSchema(today: string = berlinDay(new Date())) {
  return EDIT_FIELDS.superRefine((args, ctx) => {
    const changes =
      args.titel !== undefined ||
      args.beschreibung !== undefined ||
      args.ende !== undefined ||
      Boolean(args.termine_hinzufuegen?.length) ||
      Boolean(args.termine_entfernen?.length);
    if (!changes) {
      ctx.addIssue({ code: 'custom', message: 'Keine Änderung angegeben.' });
    }
    const past = (args.termine_hinzufuegen ?? []).map((t) => t.tag).filter((d) => d < today);
    if (past.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['termine_hinzufuegen'],
        message: `Diese Termine liegen in der Vergangenheit (heute ist ${today}): ${past.join(', ')}. Frag die Person, welche Tage gemeint sind.`,
      });
    }
    if (args.ende && args.ende <= today) {
      ctx.addIssue({
        code: 'custom',
        path: ['ende'],
        message: `Das Ablaufdatum muss nach heute liegen (heute ist ${today}).`,
      });
    }
  });
}

export function toEdit(args: EditInput): PollEdit {
  return {
    ...(args.titel !== undefined ? { title: args.titel } : {}),
    ...(args.beschreibung !== undefined ? { description: args.beschreibung } : {}),
    ...(args.ende !== undefined ? { endDate: args.ende } : {}),
    ...(args.termine_hinzufuegen?.length
      ? {
          addSlots: args.termine_hinzufuegen.flatMap((t) =>
            t.uhrzeiten?.length
              ? t.uhrzeiten.map((time) => ({ day: t.tag, time }))
              : [{ day: t.tag, time: '' }]
          ),
        }
      : {}),
    ...(args.termine_entfernen?.length
      ? { removeSlots: args.termine_entfernen.map((t) => ({ day: t.tag, time: t.uhrzeit ?? '' })) }
      : {}),
  };
}

function formStepText(err: FormStepError, poll: OwnPoll, what: string): string {
  if (err.step === 'gone') {
    return `Die Umfrage „${poll.title}" gibt es bei nuudel nicht mehr (gelöscht oder abgelaufen).`;
  }
  return `nuudel hat beim ${what} anders geantwortet als erwartet (${err.message}). Die Person soll über den Admin-Link prüfen, was angekommen ist: ${poll.adminUrl}`;
}

export function makeNuudelEditTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Ändert eine nuudel-Umfrage, die der Grünerator für die Person angelegt hat: Titel, Beschreibung, Ablaufdatum, und bei Terminumfragen Termine hinzufügen oder entfernen. Fremde nuudel-Umfragen kann es nicht ändern.

NUTZE, wenn die Person an einer ihrer Umfragen etwas ändern will („nimm den Montag raus", „füg noch den 10. dazu", „anderer Titel"). Nur angeben, was sich ändern soll. Termine als „YYYY-MM-DD" (heute ist ${berlinDay(new Date())}), Uhrzeiten wörtlich wie in der Umfrage; kennst du die Termine nicht, lies sie vorher mit nuudel_umfrage_lesen.

REGELN:
- Sind Umfrage und Änderung klar, ruf SOFORT auf, mit einem Satz davor, was geändert wird. Frag NICHT „Soll ich?": die Oberfläche zeigt der Person den Aufruf, und sie erlaubt oder lehnt ab.
- Ein Termin, auf den schon geantwortet wurde, wird nur mit stimmen_verwerfen=true entfernt, denn nuudel löscht diese Antworten endgültig. Setz das NIE von selbst: meldet das Werkzeug Antworten, sag der Person, wie viele verloren gingen, und ruf erst nach ihrem ausdrücklichen Ja erneut auf.
- nuudel begrenzt das Ablaufdatum; das Ergebnis nennt, was tatsächlich gilt.`,
    inputSchema: editInputSchema(),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      const found = await resolveOwnPoll(userId, args.umfrage);
      if ('error' in found) return found;
      const { poll } = found;
      const edit = toEdit(args);
      try {
        const after = await editOwnPoll(userId, poll, edit, {
          discardVotes: args.stimmen_verwerfen === true,
        });
        const termine = after.slots.map((s) => `${s.day}${s.time ? ` ${s.time}` : ''}`);
        const clamped = edit.endDate !== undefined && after.endDate !== edit.endDate;
        const note = `Umfrage „${after.title}" auf nuudel geändert. Termine jetzt: ${termine.join(', ') || '–'}. Läuft ab am ${after.endDate}. Teilnahme-Link: ${poll.pollUrl}.`;
        groundNote(sourceRegistry, 'nuudel-Umfrage geändert', note);
        return {
          ok: true,
          titel: after.title,
          teilnahme_link: poll.pollUrl,
          admin_link: poll.adminUrl,
          ...(poll.kind === 'date' ? { termine } : {}),
          ablauf: after.endDate,
          ...(clamped
            ? {
                hinweis: `nuudel hat das Ablaufdatum auf ${after.endDate} statt ${edit.endDate} gesetzt (das ist die Grenze dort).`,
              }
            : {}),
          note,
        };
      } catch (err) {
        if (err instanceof OrderRefused) return { error: err.userText };
        if (err instanceof FormStepError) {
          log.warn(`[nuudel-edit] step=${err.step}: ${err.message}`);
          return { error: formStepText(err, poll, 'Ändern') };
        }
        log.warn(`[nuudel-edit] failed: ${err instanceof Error ? err.message : String(err)}`);
        return { error: 'nuudel ist gerade nicht erreichbar. Nichts wurde geändert.' };
      }
    },
  });
}

export function makeNuudelDeleteTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Löscht eine nuudel-Umfrage, die der Grünerator für die Person angelegt hat, endgültig bei nuudel, samt aller Antworten, und nimmt sie aus ihrer Liste. Fremde Umfragen kann es nicht löschen.

NUTZE nur, wenn die Person ausdrücklich eine ihrer Umfragen löschen will. Ruf mit einem Satz davor auf; die Oberfläche fragt die Person vor dem Löschen.`,
    inputSchema: z.object({ umfrage: UMFRAGE_REF }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      const found = await resolveOwnPoll(userId, args.umfrage);
      if ('error' in found) return found;
      const { poll } = found;
      try {
        const outcome = await deleteOwnPoll(userId, poll);
        const note =
          outcome === 'gone'
            ? `Die Umfrage „${poll.title}" gab es bei nuudel schon nicht mehr; sie ist jetzt auch aus der Liste der Person entfernt.`
            : `Die Umfrage „${poll.title}" ist bei nuudel gelöscht, samt aller Antworten. Der Teilnahme-Link funktioniert nicht mehr.`;
        groundNote(sourceRegistry, 'nuudel-Umfrage gelöscht', note);
        return { ok: true, titel: poll.title, note };
      } catch (err) {
        if (err instanceof OrderRefused) return { error: err.userText };
        if (err instanceof FormStepError) {
          log.warn(`[nuudel-delete] step=${err.step}: ${err.message}`);
          return { error: formStepText(err, poll, 'Löschen') };
        }
        log.warn(`[nuudel-delete] failed: ${err instanceof Error ? err.message : String(err)}`);
        return { error: 'nuudel ist gerade nicht erreichbar. Nichts wurde gelöscht.' };
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
