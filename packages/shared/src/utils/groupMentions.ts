/**
 * Erwähnungen in Projekt-Beiträgen und -Kommentaren.
 *
 * - Person: `@[Anna Beispiel](user:<uuid>)` — dieselbe Grammatik wie die
 *   Chat-Tokens in `mentionTokens.ts`, aber bewusst getrennt: `user` gehört
 *   nicht in die Chat-Routing-Typen.
 * - Alle: das getippte Wort `@alle` (oder `@all`), kein Token — so wirkt es
 *   auch ohne Auswahlliste.
 *
 * Tokens sind Nutzertext: der Server prüft die Mitgliedschaft jeder id selbst.
 */

export type GroupMentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'user'; userId: string; label: string; raw: string }
  | { kind: 'all'; raw: string };

const MEMBER_TOKEN_SOURCE =
  '@\\[([^\\]\\n]{1,80})\\]\\(user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\\)';
// Kein \b: das kennt keine Umlaute, `@allä` gälte sonst als `@all`. Keine
// Lookbehind-Gruppe: die Web-App baut für Safari 15, dort ist das ein
// Syntaxfehler — das Zeichen davor wird mitgefangen (Gruppe 1) und bleibt Text.
const ALL_SOURCE = '(^|[^\\p{L}\\p{N}_])(@(?:alle|all))(?![\\p{L}\\p{N}_])';

export function buildMemberMention(label: string, userId: string): string {
  const safeLabel =
    label
      .replace(/[\]\n]/g, ' ')
      .trim()
      .slice(0, 80) || 'Mitglied';
  return `@[${safeLabel}](user:${userId})`;
}

function splitAll(text: string, out: GroupMentionSegment[]): void {
  const re = new RegExp(ALL_SOURCE, 'giu');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[1]!.length;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({ kind: 'all', raw: match[2]! });
    last = start + match[2]!.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
}

export function groupMentionSegments(text: string): GroupMentionSegment[] {
  const segments: GroupMentionSegment[] = [];
  const re = new RegExp(MEMBER_TOKEN_SOURCE, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    splitAll(text.slice(last, match.index), segments);
    segments.push({ kind: 'user', userId: match[2]!, label: match[1]!, raw: match[0] });
    last = match.index + match[0].length;
  }
  splitAll(text.slice(last), segments);
  return segments;
}

export function parseGroupMentions(text: string): { userIds: string[]; all: boolean } {
  const userIds = new Set<string>();
  let all = false;
  for (const s of groupMentionSegments(text)) {
    if (s.kind === 'user') userIds.add(s.userId);
    else if (s.kind === 'all') all = true;
  }
  return { userIds: [...userIds], all };
}

/** Lesbare Fassung für Benachrichtigungen und E-Mails: Token → `@Label`. */
export function groupMentionsToPlain(text: string): string {
  return groupMentionSegments(text)
    .map((s) => (s.kind === 'text' ? s.text : s.kind === 'user' ? `@${s.label}` : s.raw))
    .join('');
}

/** Eine im Eingabefeld gewählte Person: dort steht nur `@Label`. */
export interface GroupMentionPick {
  userId: string;
  label: string;
}

/** Gespeicherter Text → Eingabefeld: Tokens werden zu `@Label`, die Personen wandern mit. */
export function groupMentionsToDraft(text: string): { text: string; picks: GroupMentionPick[] } {
  const picks: GroupMentionPick[] = [];
  const out = groupMentionSegments(text)
    .map((s) => {
      if (s.kind === 'text') return s.text;
      if (s.kind === 'all') return s.raw;
      if (!picks.some((p) => p.userId === s.userId))
        picks.push({ userId: s.userId, label: s.label });
      return `@${s.label}`;
    })
    .join('');
  return { text: out, picks };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Eingabefeld → gespeicherter Text: jedes noch dastehende `@Label` einer
 * gewählten Person wird wieder zum Token. Gelöschte oder angetippte Namen
 * bleiben Text — so erwähnt nur, wer aus der Liste gewählt wurde. Ein
 * Bindestrich setzt den Namen fort: `@Anna-Lena` ist nicht die gewählte „Anna".
 */
export function groupMentionsFromDraft(text: string, picks: GroupMentionPick[]): string {
  // Längere Namen zuerst: „@Anna Maria" darf nicht als „@Anna" enden.
  const sorted = [...picks].sort((a, b) => b.label.length - a.label.length);
  let out = text;
  for (const p of sorted) {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}_\\[])@${escapeRegExp(p.label)}(?![\\p{L}\\p{N}_\\]-])`,
      'gu'
    );
    out = out.replace(re, (_m, before: string) => before + buildMemberMention(p.label, p.userId));
  }
  return out;
}
