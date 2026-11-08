/**
 * Die Prosa des Tagesbriefings: der erste Absatz nach dem Gruß, die
 * Überleitungen zu den Listen, ein Rückblick auf die eigene Arbeit und ein
 * Menü, wie es weitergehen kann — samt 1–2 Chips.
 *
 * Ein Modellaufruf, kurz begrenzt. Scheitert er oder verwirft der Validator die
 * Antwort, gibt es `null`, und `composeBriefing` nimmt feste Sätze — das
 * Briefing wartet nie auf ein zweites Modell.
 */
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';

import { MIN_RECENT_FOR_IDEA, countWord, dueLabel } from './composeBriefing.js';
import { BRIEFING_LANE, BRIEFING_MODEL } from './model.js';
import { berlinDay, weekdayOf } from './time.js';

import type { BriefingInputs, PersonalLines } from './types.js';
import type { StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('briefing:personal');

const INTRO_MAX = 320;
const LEAD_MAX = 180;
const RECAP_MAX = 360;
const IDEA_ITEM_MAX = 120;
const MIN_IDEAS = 2;
const MAX_IDEAS = 4;
const SUGGESTION_MAX = 70;
/** Vereinzelt, nicht in jedem Satz. */
const MAX_EMOJIS = 3;
const TIMEOUT_MS = 7_000;

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Floskeln und Bürosprache, die in keinem Satz stehen dürfen. */
const BANNED = [
  /ich hoffe/i,
  /rockst/i,
  /!!/,
  /als (dein|ihr) (ki|assistent)/i,
  /wie geht es dir/i,
  /im fokus/i,
  /reichweite (zu )?erhöhen/i,
];

const EMOJI = /\p{Extended_Pictographic}/gu;

const outputSchema = z.object({
  intro: z.string(),
  tasksLead: z.string().nullable().optional(),
  newsLead: z.string().nullable().optional(),
  recap: z.string().nullable().optional(),
  ideasLead: z.string().nullable().optional(),
  ideas: z.array(z.string()).nullable().optional(),
  basedOn: z.string().nullable().optional(),
  suggestions: z.array(z.string()).nullable().optional(),
});

const TITLE_STOPWORDS = new Set(['muster', 'für', 'zum', 'zur', 'und', 'der', 'die', 'das', 'mit']);

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w));
}

/**
 * Worauf der Rückblick sich stützt: die genannte Kurz-Id, wenn es sie gibt —
 * sonst das erste Element, dessen markantes Titelwort im Text vorkommt. Kleine
 * Modelle lassen `basedOn` gern leer, obwohl der Text den Bezug klar nennt.
 */
export function groundIdea(
  text: string,
  basedOn: string | null,
  recent: ReadonlyArray<{ ref: string; title: string }>
): string | null {
  if (basedOn && recent.some((r) => r.ref === basedOn)) return basedOn;
  const lower = text.toLowerCase();
  return (
    recent.find((r) => titleWords(r.title).some((w) => lower.includes(w.slice(0, 6))))?.ref ?? null
  );
}

function numbersIn(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

function cleanList(items: readonly string[] | null | undefined, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items ?? []) {
    const item = raw.trim().replace(/^[-•*]\s*/, '');
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Die Prüfung der Modellantwort. `allowIdea` ist falsch, wenn zu wenig eigene
 * Arbeit vorliegt — dann gibt es weder Rückblick noch Vorschläge.
 */
export function validatePersonalLines(
  input: unknown,
  ctx: {
    inputText: string;
    recent: ReadonlyArray<{ ref: string; title: string }>;
    taskCount: number;
    allowIdea: boolean;
  }
): StructuredValidation<PersonalLines> {
  const parsed = outputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const d = parsed.data;

  const intro = d.intro.trim();
  if (intro.length < 10) return { ok: false, error: 'intro fehlt.' };
  if (intro.length > INTRO_MAX)
    return { ok: false, error: `intro zu lang (${intro.length} > ${INTRO_MAX}).` };

  const tasksLead = d.tasksLead?.trim() || null;
  const newsLead = d.newsLead?.trim() || null;
  const ideasLead = ctx.allowIdea ? d.ideasLead?.trim() || null : null;
  for (const [label, lead] of [
    ['tasksLead', tasksLead],
    ['newsLead', newsLead],
    ['ideasLead', ideasLead],
  ] as const) {
    if (lead && lead.length > LEAD_MAX)
      return { ok: false, error: `${label} zu lang (${lead.length} > ${LEAD_MAX}).` };
  }

  let recap: string | null = null;
  let ideas: string[] = [];
  let basedOn: string | null = null;
  if (ctx.allowIdea) {
    recap = d.recap?.trim() || null;
    ideas = cleanList(d.ideas, MAX_IDEAS);
    if (!recap)
      return {
        ok: false,
        error: 'recap fehlt: fass zusammen, woran die Person zuletzt gearbeitet hat.',
      };
    if (recap.length > RECAP_MAX)
      return { ok: false, error: `recap zu lang (${recap.length} > ${RECAP_MAX}).` };
    basedOn = groundIdea(recap, d.basedOn?.trim() || null, ctx.recent);
    if (!basedOn)
      return {
        ok: false,
        error:
          'recap nennt nichts aus der eigenen Arbeit — nenn die Themen der Chats oder Dokumente.',
      };
    if (ideas.length < MIN_IDEAS)
      return { ok: false, error: `ideas braucht ${MIN_IDEAS}–${MAX_IDEAS} Vorschläge.` };
    const long = ideas.find((i) => i.length > IDEA_ITEM_MAX);
    if (long) return { ok: false, error: `Vorschlag zu lang: "${long.slice(0, 40)}…"` };
  }

  const prose = [intro, tasksLead, newsLead, recap, ideasLead, ...ideas].filter(Boolean).join(' ');
  if (BANNED.some((re) => re.test(prose)))
    return { ok: false, error: 'Der Text enthält eine verbotene Floskel oder Bürosprache.' };
  if ((prose.match(EMOJI) ?? []).length > MAX_EMOJIS)
    return { ok: false, error: `Höchstens ${MAX_EMOJIS} Emojis insgesamt.` };
  const known = numbersIn(ctx.inputText);
  const invented = (prose.match(/\d+/g) ?? []).find((n) => !known.has(n));
  if (invented) return { ok: false, error: `Zahl ${invented} steht nicht in den Eingaben.` };
  const countMatch =
    /\b(eine|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\s+(offene\s+)?Aufgabe/i.exec(
      prose
    );
  if (countMatch && countMatch[1].toLowerCase() !== countWord(ctx.taskCount))
    return {
      ok: false,
      error: `Der Text nennt ${countMatch[1]} Aufgaben, offen sind ${ctx.taskCount}.`,
    };

  let suggestions = cleanList(d.suggestions, 2).filter((s) => s.length <= SUGGESTION_MAX);
  if (!ctx.allowIdea) suggestions = [];
  else if (suggestions.length === 0)
    suggestions = ideas
      .slice(0, 2)
      .filter((s) => s.length <= SUGGESTION_MAX)
      .map(capitalize);

  return {
    ok: true,
    value: { intro, tasksLead, newsLead, recap, ideasLead, ideas, basedOn, suggestions },
  };
}

const SYSTEM = `Du bist der Grünerator, das KI-Werkzeug von Bündnis 90/Die Grünen, und schreibst einer aktiven Person ihre Nachricht für den Tag — so, wie eine nette Kollegin morgens eine Nachricht schreibt: menschlich, locker, konkret. Keine Pressemitteilung, kein Bericht.

Die Nachricht hat feste Teile, die der Code einsetzt: den Gruß mit Namen, die Aufgabenliste und die Lagebild-Liste. Du schreibst die Prosa drumherum:
- intro: der erste Absatz nach dem Gruß, 1–3 Sätze. Was ist heute das Wichtigste, worauf lohnt es sich zu achten? Gern mit Bezug zum Wochentag.
- tasksLead: EIN Satz, der zur Aufgabenliste überleitet (sie folgt direkt darunter — zähl die Aufgaben nicht noch einmal auf). Leer, wenn es keine Aufgaben gibt.
- newsLead: EIN Satz, der zum Lagebild überleitet (die Meldungen folgen darunter). Leer, wenn es kein Lagebild gibt.
Nur wenn „Ideen erlaubt: ja":
- recap: 1–3 Sätze Rückblick, woran die Person zuletzt gearbeitet hat — z. B. „Du hast zuletzt am Kita-Antrag gesessen und eine Pressemitteilung zum Radentscheid angefangen." Nenn die Themen beim Namen; basedOn ist die Kurz-Id des wichtigsten Elements.
- ideasLead: EIN Satz, der zu den Vorschlägen überleitet, z. B. „Um da weiterzumachen, könnten wir zum Beispiel:"
- ideas: 2–4 kurze Vorschläge (je höchstens 12 Wörter), die an die eigene Arbeit oder ein aktuelles Thema anknüpfen, kleingeschrieben als Fortsetzung des Satzes: „ein Sharepic zum Kita-Antrag bauen", „Aktionsideen für den Radentscheid sammeln", „einen Instagram-Post zum Klimageld schreiben". Nimm nur, was der Grünerator kann: Sharepics, Social-Media-Posts, Pressemitteilungen, Reden, Anträge, Aktionsideen und Aktionspläne, Flyer-Texte, eine Erklärseite in einfacher Sprache, einen Podcast, Recherche in den Notebooks.
- suggestions: 1–2 der Vorschläge als Ein-Klick-Auftrag (höchstens 8 Wörter), z. B. „Sharepic zum Kita-Antrag bauen".

Ton:
- Schreib, wie man spricht: Verben statt Substantive, kurze Sätze, Du-Form, Genderstern. Gern mal ein „übrigens", „kurz", „schon".
- Vereinzelt ein passendes Emoji ist willkommen (höchstens 2–3 in der ganzen Nachricht, nie mehrere hintereinander).
- Kein Nominalstil, keine Bürosprache. Nicht: „Heute stehen die Finalisierung des Antrags und die Pressemitteilung im Fokus." Sondern: „Der Kita-Antrag will heute fertig werden, und die Pressemitteilung zum Radentscheid hängt seit Dienstag – die würde ich zuerst angehen."
- Fang nicht mit einem Gruß oder dem Namen an, das steht schon davor.

Fakten:
- Nur was in den Eingaben steht. Keine erfundenen Zahlen, Orte, Personen oder Termine. Über Kalender, Termine oder Mails weißt du nichts — erwähne sie nicht. Keine Aufgaben heißt nur: auf den Boards ist nichts offen.
- Verboten: „Ich hoffe …", Lob ohne Anlass, Ausrufezeichen-Ketten.
Sind keine Ideen erlaubt, lass recap, ideasLead, ideas, basedOn und suggestions leer.`;

const SYSTEM_AT = `${SYSTEM}

## LÄNDERKONTEXT: ÖSTERREICH
Die Person ist in Österreich aktiv. Schreib österreichisch: Nationalrat statt Bundestag, Landesorganisation statt Landesverband, Jänner statt Januar, Gemeinde statt Kommune.`;

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string', description: 'Der erste Absatz nach dem Gruß' },
    tasksLead: { type: 'string', description: 'Überleitung zur Aufgabenliste, leer wenn keine' },
    newsLead: { type: 'string', description: 'Überleitung zum Lagebild, leer wenn keins' },
    recap: { type: 'string', description: 'Rückblick auf die eigene Arbeit' },
    ideasLead: { type: 'string', description: 'Überleitung zu den Vorschlägen' },
    ideas: { type: 'array', items: { type: 'string' }, description: '2–4 Vorschläge' },
    basedOn: { type: 'string', description: 'Kurz-Id des wichtigsten Elements der eigenen Arbeit' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: '1–2 Ein-Klick-Aufträge',
    },
  },
  required: ['intro'],
};

/** Der Nutzerteil des Prompts — alles Persönliche steht hier, der Systemteil bleibt gleich (Prompt-Cache). */
export function personalPrompt(inputs: BriefingInputs, now: Date, allowIdea: boolean): string {
  const today = berlinDay(now);
  const lines: string[] = [
    `Heute: ${WEEKDAYS[weekdayOf(today)]}`,
    `Vorname: ${inputs.firstName ?? '(unbekannt)'}`,
    `Rolle: ${inputs.roleLine ?? '(keine angegeben)'}`,
    `Ideen erlaubt: ${allowIdea ? 'ja' : 'nein'}`,
    '',
    `## Offene Aufgaben (${inputs.cards.length})`,
    ...(inputs.cards.length > 0
      ? inputs.cards
          .slice(0, 5)
          .map(
            (c) =>
              `- ${c.title}${c.dueDate ? ` (${dueLabel(c.dueDate, today, inputs.locale)})` : ''}`
          )
      : ['- keine']),
    '',
    '## Lagebild',
    ...(inputs.lagebild?.items.length
      ? inputs.lagebild.items.map((i) => `- ${i.text}`)
      : ['- keins']),
    ...inputs.lvNews.map((n) => `- Neu im Landesverband ${inputs.lvName ?? ''}: ${n.title}`),
    ...inputs.partyNews.map((n) => `- Neu bei den Grünen (${n.sourceName}): ${n.title}`),
    '',
    '## Eigene Arbeit der letzten Tage (Kurz-Id | Art | Titel | Details)',
    ...(inputs.recent.length > 0
      ? inputs.recent.map(
          (r) =>
            `${r.ref} | ${r.kind === 'chat' ? 'Chat' : 'Dokument'} | ${r.title} | ${r.detail ?? ''}`
        )
      : ['- nichts']),
    '',
    'Gib deine Texte über das Tool tagesbriefing_abgeben ab.',
  ];
  return lines.join('\n');
}

export async function generatePersonalLines(
  inputs: BriefingInputs,
  now: Date
): Promise<PersonalLines | null> {
  const allowIdea = inputs.recent.length >= MIN_RECENT_FOR_IDEA;
  const prompt = personalPrompt(inputs, now, allowIdea);
  const started = Date.now();
  try {
    const result = await aiObject<PersonalLines>({
      lane: BRIEFING_LANE,
      pinned: BRIEFING_MODEL,
      system: inputs.locale === 'de-AT' ? SYSTEM_AT : SYSTEM,
      prompt,
      toolName: 'tagesbriefing_abgeben',
      toolDescription:
        'Gib Einleitung, Überleitungen, Rückblick, Vorschläge und die Ein-Klick-Aufträge ab.',
      schema: TOOL_SCHEMA,
      validate: (input) =>
        validatePersonalLines(input, {
          inputText: prompt,
          recent: inputs.recent,
          taskCount: inputs.cards.length,
          allowIdea,
        }),
      temperature: 0.6,
      maxOutputTokens: 8000,
      timeoutMs: TIMEOUT_MS,
      attempts: 2,
      label: 'briefing:personal',
    });
    log.info(
      `personal lines user=${inputs.userId} ok=${result.ok} ideas=${result.ok ? result.data.ideas.length : 0} ms=${Date.now() - started}`
    );
    return result.ok ? result.data : null;
  } catch (error) {
    log.warn(`personal lines failed user=${inputs.userId}: ${(error as Error).message}`);
    return null;
  }
}
