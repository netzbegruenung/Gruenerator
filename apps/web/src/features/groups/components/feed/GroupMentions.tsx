import {
  groupMentionSegments,
  groupMentionsFromDraft,
  groupMentionsToDraft,
  type GroupMentionPick,
} from '@gruenerator/shared/utils';
import { cn } from '@gruenerator/ui';
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface MentionCandidate {
  userId: string;
  label: string;
}

interface GroupMentionOptions {
  candidates: MentionCandidate[];
  /** @alle anbieten — in der System-Gruppe nur, wer dort auch schreiben darf. */
  allowAll: boolean;
  /** null: die System-Gruppe, die Zahl bleibt verborgen. */
  memberCount: number | null;
}

const GroupMentionContext = createContext<GroupMentionOptions>({
  candidates: [],
  allowAll: false,
  memberCount: null,
});

export const GroupMentionProvider = GroupMentionContext.Provider;

type Suggestion = { kind: 'all' } | ({ kind: 'user' } & MentionCandidate);

const MAX_PEOPLE = 6;

/** `@anna` direkt vor dem Cursor, am Anfang oder nach Leerraum. */
function detectTrigger(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

/**
 * Eingabe mit Erwähnungen: im Feld steht `@Name`, gespeichert wird das Token
 * (`serialize`). `@` öffnet die Auswahl, Pfeiltasten wählen, Enter/Tab setzt ein.
 * `maxLength` gilt für den gespeicherten Text — das Feld bekommt nur, was nach
 * den längeren Tokens übrig bleibt.
 */
export function useMentionDraft(maxLength: number, initialStored = '') {
  const { candidates, allowAll, memberCount } = useContext(GroupMentionContext);
  const [draft, setDraft] = useState(() => groupMentionsToDraft(initialStored));
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  // Cursor hinter die Einfügung — direkt nach dem Rendern, bevor die nächste Taste kommt.
  const pendingCaret = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; pos: number } | null>(
    null
  );
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    pending.el.focus();
    pending.el.setSelectionRange(pending.pos, pending.pos);
  });

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    const people = candidates
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, MAX_PEOPLE)
      .map((c): Suggestion => ({ kind: 'user', ...c }));
    return allowAll && 'alle'.startsWith(q) ? [{ kind: 'all' }, ...people] : people;
  }, [trigger, candidates, allowAll]);

  const open = suggestions.length > 0;
  const activeIndex = Math.min(active, Math.max(suggestions.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  const stored = groupMentionsFromDraft(draft.text, draft.picks);
  const tokenOverhead = stored.length - draft.text.length;

  const setText = (text: string, caret: number) => {
    // Wessen `@Name` gelöscht ist, der ist nicht mehr gewählt — auch nicht,
    // wenn der Name später von Hand wieder dasteht.
    setDraft((d) => ({ text, picks: d.picks.filter((p) => text.includes(`@${p.label}`)) }));
    setTrigger(detectTrigger(text, caret));
    setActive(0);
  };

  const choose = (s: Suggestion, el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!trigger) return;
    const insert = s.kind === 'all' ? '@alle ' : `@${s.label} `;
    const text =
      draft.text.slice(0, trigger.start) +
      insert +
      draft.text.slice(trigger.start + 1 + trigger.query.length);
    const picks: GroupMentionPick[] =
      s.kind === 'user' && !draft.picks.some((p) => p.userId === s.userId)
        ? [...draft.picks, { userId: s.userId, label: s.label }]
        : draft.picks;
    setDraft({ text, picks });
    setTrigger(null);
    if (el) pendingCaret.current = { el, pos: trigger.start + insert.length };
  };

  /** true: die Taste gehörte der Auswahl und ist verbraucht. */
  const handleKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + suggestions.length) % suggestions.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
      e.preventDefault();
      choose(suggestions[activeIndex]!, e.currentTarget);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setTrigger(null);
      return true;
    }
    return false;
  };

  return {
    text: draft.text,
    serialize: () => stored.trim(),
    /** Gewählte Erwähnungen haben den Text über die Grenze geschoben. */
    tooLong: stored.trim().length > maxLength,
    reset: (stored = '') => {
      setDraft(groupMentionsToDraft(stored));
      setTrigger(null);
    },
    handleKey,
    inputProps: {
      value: draft.text,
      maxLength: Math.max(maxLength - tokenOverhead, 0),
      onChange: (e: { target: HTMLInputElement | HTMLTextAreaElement }) =>
        setText(e.target.value, e.target.selectionStart ?? e.target.value.length),
      onBlur: () => setTrigger(null),
      ...(open ? { 'aria-controls': listId, 'aria-activedescendant': optionId(activeIndex) } : {}),
    },
    listProps: { id: listId, open, suggestions, activeIndex, optionId, memberCount, choose },
  };
}

type MentionListProps = ReturnType<typeof useMentionDraft>['listProps'] & {
  inputRef: { current: HTMLInputElement | HTMLTextAreaElement | null };
  className?: string;
};

/** Die Vorschlagsliste unter dem Feld; der Fokus bleibt im Feld. */
export function MentionSuggestions({
  id,
  open,
  suggestions,
  activeIndex,
  optionId,
  memberCount,
  choose,
  inputRef,
  className,
}: MentionListProps) {
  if (!open) return null;
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Erwähnen"
      className={cn(
        'absolute left-0 z-50 m-0 w-64 max-w-full list-none overflow-hidden rounded-lg border border-grey-200 bg-card p-0 py-1 shadow-lg dark:border-grey-700',
        className
      )}
    >
      {suggestions.map((s, i) => (
        <li
          key={s.kind === 'all' ? 'all' : s.userId}
          id={optionId(i)}
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            choose(s, inputRef.current);
          }}
          className={cn(
            'flex cursor-pointer flex-col px-3 py-1.5 text-sm',
            i === activeIndex
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
              : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
          )}
        >
          {s.kind === 'all' ? (
            <>
              <span className="font-semibold">@alle</span>
              <span className="text-xs text-muted-foreground">
                {memberCount === null
                  ? 'benachrichtigt alle im Grünerator'
                  : `benachrichtigt alle ${memberCount} Mitglieder`}
              </span>
            </>
          ) : (
            <span className="truncate">{s.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Text mit hervorgehobenen Erwähnungen. */
export function GroupMentionText({ text }: { text: string }): ReactNode {
  let offset = 0;
  return groupMentionSegments(text).map((s) => {
    const key = `m-${offset}`;
    offset += s.kind === 'text' ? s.text.length : s.raw.length;
    if (s.kind === 'text') return <span key={key}>{s.text}</span>;
    return (
      <span key={key} className="font-semibold text-primary-600 dark:text-primary-400">
        {s.kind === 'all' ? s.raw : `@${s.label}`}
      </span>
    );
  });
}
