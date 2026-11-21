import { type GroupMember } from '@gruenerator/shared/groups';
import { type GroupMentionPick } from '@gruenerator/shared/utils';

export interface MentionCandidate {
  userId: string;
  label: string;
}

export interface MentionOptions {
  candidates: MentionCandidate[];
  /** @alle anbieten — in der System-Gruppe nur, wer dort auch schreiben darf. */
  allowAll: boolean;
  /** null: die System-Gruppe, die Zahl bleibt verborgen. */
  memberCount: number | null;
}

export type MentionSuggestion = { kind: 'all' } | ({ kind: 'user' } & MentionCandidate);

export interface MentionTrigger {
  start: number;
  query: string;
}

export const MAX_MENTION_PEOPLE = 6;

/** Wer erwähnt werden kann und ob `@alle` dazugehört — dieselbe Regel wie im Web. */
export function buildMentionOptions(
  members: GroupMember[],
  currentUserId: string | null,
  isSystem: boolean,
  canShare: boolean
): MentionOptions {
  return {
    candidates: members
      .filter((m) => m.user_id !== currentUserId)
      .map((m) => ({ userId: m.user_id, label: m.display_name || m.first_name || '' }))
      .filter((c) => c.label),
    allowAll: !isSystem || canShare,
    memberCount: isSystem ? null : members.length,
  };
}

/** `@anna` direkt vor dem Cursor, am Anfang oder nach Leerraum. */
export function detectMentionTrigger(text: string, caret: number): MentionTrigger | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function mentionSuggestions(
  options: MentionOptions,
  trigger: MentionTrigger | null
): MentionSuggestion[] {
  if (!trigger) return [];
  const q = trigger.query.toLowerCase();
  const people = options.candidates
    .filter((c) => c.label.toLowerCase().includes(q))
    .slice(0, MAX_MENTION_PEOPLE)
    .map((c): MentionSuggestion => ({ kind: 'user', ...c }));
  return options.allowAll && 'alle'.startsWith(q) ? [{ kind: 'all' }, ...people] : people;
}

/** Setzt `@Name ` an die Stelle des Auslösers; `caret` steht dahinter. */
export function insertMention(
  text: string,
  trigger: MentionTrigger,
  suggestion: MentionSuggestion,
  picks: GroupMentionPick[]
): { text: string; caret: number; picks: GroupMentionPick[] } {
  const insert = suggestion.kind === 'all' ? '@alle ' : `@${suggestion.label} `;
  const next =
    text.slice(0, trigger.start) + insert + text.slice(trigger.start + 1 + trigger.query.length);
  const add =
    suggestion.kind === 'user' && !picks.some((p) => p.userId === suggestion.userId)
      ? [...picks, { userId: suggestion.userId, label: suggestion.label }]
      : picks;
  return { text: next, caret: trigger.start + insert.length, picks: add };
}

/** Wessen `@Name` gelöscht ist, der ist nicht mehr gewählt — auch nicht, wenn der Name später von Hand wieder dasteht. */
export function pruneMentionPicks(text: string, picks: GroupMentionPick[]): GroupMentionPick[] {
  const kept = picks.filter((p) => text.includes(`@${p.label}`));
  return kept.length === picks.length ? picks : kept;
}
