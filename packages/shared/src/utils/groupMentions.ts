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
// Kein \b: das kennt keine Umlaute, `@allä` gälte sonst als `@all`.
const ALL_SOURCE = '(?<![\\p{L}\\p{N}_])@(?:alle|all)(?![\\p{L}\\p{N}_])';

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
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    out.push({ kind: 'all', raw: match[0] });
    last = match.index + match[0].length;
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
