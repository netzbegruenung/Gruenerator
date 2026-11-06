/**
 * Baut aus den Eingaben die fertige Briefing-Nachricht. Rein: kein I/O, keine
 * Uhr (die Zeit kommt als Argument), damit jede Form im Test festgehalten ist.
 *
 * Was deterministisch ist, bleibt es: Aufgaben-Titel stehen wörtlich da, Links
 * und Fälligkeiten setzt der Code. Das Modell steuert nur den Einleitungssatz
 * und die Idee bei (`PersonalLines`); fehlen die, greift eine feste Vorlage.
 */
import { getGreeting } from '@gruenerator/shared/utils';

import { TOPIC_NAMES } from '../monitor/types.js';

import { berlinDay, berlinHour, daysBetween, weekdayOf } from './time.js';

import type { BriefingInputs, BriefingLocale, LagebildItem, PersonalLines } from './types.js';
import type { MyOpenCard } from '../boards/myOpenCards.js';

export const MAX_TASK_LINES = 3;
export const MAX_NEWS_LINES = 4;
/** Ab so vielen eigenen Chats/Dokumenten gibt es eine Idee. */
export const MIN_RECENT_FOR_IDEA = 2;

export const CLOSING_QUESTION = 'Wie kann ich dir heute helfen?';

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAY_LONG = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];
const MONTHS_DE = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sep.',
  'Okt.',
  'Nov.',
  'Dez.',
];
const MONTHS_AT = ['Jän.', ...MONTHS_DE.slice(1)];

const NUMBER_WORDS = [
  'null',
  'eine',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'elf',
  'zwölf',
];

/** Kommunale Ebenen lesen Alltagsthemen zuerst, Europa liest Europa zuerst. */
const PREFERRED_TOPICS_BY_EBENE: Record<string, readonly string[]> = {
  europa: ['europa'],
  kreisverband: ['mobilitaet', 'soziales', 'bildung', 'klima'],
  ortsverband: ['mobilitaet', 'soziales', 'bildung', 'klima'],
  bezirk: ['mobilitaet', 'soziales', 'bildung', 'klima'],
  gemeinde: ['mobilitaet', 'soziales', 'bildung', 'klima'],
};

export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Markdown-Steuerzeichen in fremdem Text entschärfen (Titel, Quellen). */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<>#])/g, '\\$1');
}

function safeUrl(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
}

export function formatDayMonth(day: string, locale: BriefingLocale): string {
  const [, month, date] = day.split('-').map(Number);
  const months = locale === 'de-AT' ? MONTHS_AT : MONTHS_DE;
  return `${date}. ${months[month - 1]}`;
}

export function briefingTitle(day: string, locale: BriefingLocale): string {
  return `Dein Tag · ${formatDayMonth(day, locale)}`;
}

/** „überfällig seit Mo", „heute fällig", „morgen fällig", „bis Freitag", „bis 20. Nov." */
export function dueLabel(due: string | null, today: string, locale: BriefingLocale): string | null {
  if (!due) return null;
  const delta = daysBetween(today, due);
  if (delta < 0) {
    return -delta <= 6
      ? `überfällig seit ${WEEKDAY_SHORT[weekdayOf(due)]}`
      : `überfällig seit ${formatDayMonth(due, locale)}`;
  }
  if (delta === 0) return 'heute fällig';
  if (delta === 1) return 'morgen fällig';
  if (delta <= 6) return `bis ${WEEKDAY_LONG[weekdayOf(due)]}`;
  return `bis ${formatDayMonth(due, locale)}`;
}

function taskLine(card: MyOpenCard, today: string, locale: BriefingLocale): string {
  const label = dueLabel(card.dueDate, today, locale);
  const link = `[${escapeMarkdown(card.boardTitle)}](/boards/${card.boardId}?card=${encodeURIComponent(card.cardId)})`;
  return `- **${escapeMarkdown(card.title)}**${label ? `: ${label}` : ''} · ${link}`;
}

function orderLagebild(items: readonly LagebildItem[], ebene: string | null): LagebildItem[] {
  const preferred = (ebene && PREFERRED_TOPICS_BY_EBENE[ebene]) || [];
  const rank = (item: LagebildItem) => {
    if (item.kind === 'partei') return -1;
    const i = item.topic ? preferred.indexOf(item.topic) : -1;
    return i === -1 ? preferred.length : i;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function lagebildLine(item: LagebildItem): string {
  const label =
    item.kind === 'partei'
      ? 'Grüne in den Medien'
      : (item.topic && TOPIC_NAMES[item.topic]) || 'Welt';
  return `- **${label}:** ${escapeMarkdown(item.text)} ([${escapeMarkdown(item.source)}](${safeUrl(item.url)}))`;
}

function lvDayLabel(day: string, today: string, locale: BriefingLocale): string {
  const delta = daysBetween(day, today);
  if (delta <= 0) return 'heute';
  if (delta === 1) return 'gestern';
  return formatDayMonth(day, locale);
}

function newsLines(inputs: BriefingInputs, today: string): string[] {
  const lines: string[] = [];
  const lvLabel = inputs.locale === 'de-AT' ? 'Neu in der Landesorganisation' : 'Neu im LV';
  const lv = inputs.lvName ? inputs.lvNews[0] : undefined;
  if (lv && inputs.lvName) {
    lines.push(
      `- **${lvLabel} ${escapeMarkdown(inputs.lvName)}:** „${escapeMarkdown(lv.title)}“ (${lvDayLabel(lv.day, today, inputs.locale)}) ([${escapeMarkdown(lv.sourceName)}](${safeUrl(lv.url)}))`
    );
  }
  const party = inputs.partyNews[0];
  if (party) {
    lines.push(
      `- **Neu bei den Grünen:** „${escapeMarkdown(party.title)}“ (${lvDayLabel(party.day, today, inputs.locale)}, [${escapeMarkdown(party.sourceName)}](${safeUrl(party.url)}))`
    );
  }
  for (const item of orderLagebild(inputs.lagebild?.items ?? [], inputs.ebene)) {
    if (lines.length >= MAX_NEWS_LINES) break;
    lines.push(lagebildLine(item));
  }
  return lines;
}

/** Der Gruß mit Namen, mit Satzzeichen am Ende. Vor 6 Uhr grüßt das Briefing wie am Morgen. */
export function greetingLine(
  firstName: string | null,
  locale: BriefingLocale,
  hour: number
): string {
  const greeting = getGreeting(locale, firstName, { short: true, hour: Math.max(hour, 6) });
  return /[.!?]$/.test(greeting) ? greeting : `${greeting}.`;
}

/** Die feste Einleitung, wenn das Modell keine geliefert hat. */
export const FALLBACK_TASKS_LEAD = 'Auf deinen Boards wartet das hier auf dich:';
export const FALLBACK_NEWS_LEAD = 'Und das ist gerade los:';
export const FALLBACK_IDEAS_LEAD = 'Um weiterzumachen, könnten wir zum Beispiel:';

export function fallbackIntro(taskCount: number, hasNews: boolean, hasIdea: boolean): string {
  if (taskCount > 0) {
    const verb = taskCount === 1 ? 'Aufgabe wartet' : 'Aufgaben warten';
    return `${capitalize(countWord(taskCount))} ${verb} heute auf dich${hasNews ? ', und im Lagebild gibt es Neues' : ''}.`;
  }
  if (!hasIdea)
    return hasNews
      ? 'Schön, dass du da bist. Draußen ist heute einiges los.'
      : 'Schön, dass du da bist.';
  return hasNews
    ? 'Auf deinen Boards ist gerade nichts offen, hier ist dein Überblick für heute.'
    : 'Hier ist dein kurzer Überblick für heute.';
}

export interface ComposedBriefing {
  title: string;
  markdown: string;
  followUpSuggestions: string[];
  sections: { tasks: number; news: number; ideas: number };
  notificationTitle: string;
  notificationBody: string;
}

export function composeBriefing(
  inputs: BriefingInputs,
  personal: PersonalLines | null,
  now: Date
): ComposedBriefing | null {
  const today = berlinDay(now);
  const tasks = inputs.cards;
  const news = newsLines(inputs, today);
  const ideas = personal?.ideas ?? [];
  const idea = ideas.length > 0;

  if (tasks.length === 0 && news.length === 0 && !idea) return null;

  const intro = personal?.intro?.trim() || fallbackIntro(tasks.length, news.length > 0, !!idea);
  // Wie in einer Mail: der Gruß steht für sich, dann ein Absatz Abstand.
  const blocks: string[] = [greetingLine(inputs.firstName, inputs.locale, berlinHour(now)), intro];

  if (tasks.length > 0) {
    const lines = tasks.slice(0, MAX_TASK_LINES).map((c) => taskLine(c, today, inputs.locale));
    const rest = tasks.length - MAX_TASK_LINES;
    blocks.push(
      [
        personal?.tasksLead?.trim() || FALLBACK_TASKS_LEAD,
        ...lines,
        ...(rest > 0 ? [`+${rest} weitere auf deinen Boards`] : []),
      ].join('\n')
    );
  }

  if (news.length > 0)
    blocks.push([personal?.newsLead?.trim() || FALLBACK_NEWS_LEAD, ...news].join('\n'));

  if (idea && personal) {
    if (personal.recap) blocks.push(personal.recap);
    blocks.push(
      [personal.ideasLead || FALLBACK_IDEAS_LEAD, ...ideas.map((i) => `- ${i}`)].join('\n')
    );
  } else {
    blocks.push(CLOSING_QUESTION);
  }

  const suggestions = idea ? (personal?.suggestions ?? []).slice(0, 2) : [];
  if (suggestions.length === 0 && tasks[0]) suggestions.push(`Hilf mir mit „${tasks[0].title}“`);

  const parts = [
    ...(tasks.length > 0 ? [`${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`] : []),
    ...(news.length > 0 ? ['Lagebild'] : []),
    ...(idea ? ['Ideen für heute'] : []),
  ];

  return {
    title: briefingTitle(today, inputs.locale),
    markdown: blocks.join('\n\n'),
    followUpSuggestions: suggestions,
    sections: { tasks: tasks.length, news: news.length, ideas: ideas.length },
    notificationTitle: inputs.firstName
      ? `${inputs.firstName}, dein Tag ist da`
      : 'Dein Tag ist da',
    notificationBody: parts.join(' · '),
  };
}
