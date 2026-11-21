import {
  groupMentionsFromDraft,
  groupMentionsToDraft,
  type GroupMentionPick,
} from '@gruenerator/shared/utils';
import { useCallback, useMemo, useState } from 'react';

import {
  detectMentionTrigger,
  insertMention,
  mentionSuggestions,
  pruneMentionPicks,
  type MentionOptions,
  type MentionSuggestion,
} from '../components/projekte/mentionDraft';

/**
 * Eingabe mit Erwähnungen: im Feld steht `@Name`, gespeichert wird das Token
 * (`serialize`). `@` öffnet die Auswahl. `maxLength` gilt für den gespeicherten
 * Text — das Feld bekommt nur, was nach den längeren Tokens übrig bleibt.
 */
export function useMentionDraft(options: MentionOptions, maxLength: number, initialStored = '') {
  const [draft, setDraft] = useState(() => groupMentionsToDraft(initialStored));
  const [caret, setCaret] = useState(draft.text.length);
  // Nach einer Auswahl setzen wir den Cursor einmal selbst, bis das Feld ihn zurückmeldet.
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(
    null
  );

  const suggestions = useMemo(
    () => mentionSuggestions(options, detectMentionTrigger(draft.text, caret)),
    [options, draft.text, caret]
  );

  const stored = groupMentionsFromDraft(draft.text, draft.picks).trim();
  const tokenOverhead = stored.length - draft.text.trim().length;

  const setText = useCallback((text: string) => {
    setDraft((d) => ({ text, picks: pruneMentionPicks(text, d.picks) }));
  }, []);

  const choose = useCallback(
    (s: MentionSuggestion) => {
      const trigger = detectMentionTrigger(draft.text, caret);
      if (!trigger) return;
      const next = insertMention(draft.text, trigger, s, draft.picks);
      setDraft({ text: next.text, picks: next.picks });
      setCaret(next.caret);
      setForcedSelection({ start: next.caret, end: next.caret });
    },
    [draft, caret]
  );

  const reset = useCallback(() => {
    setDraft({ text: '', picks: [] });
    setCaret(0);
    setForcedSelection(null);
  }, []);

  /** Ein fertiger Anfangstext samt gewählter Personen, z. B. „@Anna “ bei einer Antwort. */
  const start = useCallback((text: string, picks: GroupMentionPick[]) => {
    setDraft({ text, picks });
    setCaret(text.length);
    setForcedSelection(null);
  }, []);

  return {
    text: draft.text,
    picks: draft.picks,
    suggestions,
    serialize: () => stored,
    /** Gewählte Erwähnungen haben den Text über die Grenze geschoben. */
    tooLong: stored.length > maxLength,
    choose,
    reset,
    start,
    inputProps: {
      value: draft.text,
      maxLength: Math.max(maxLength - tokenOverhead, 0),
      onChangeText: setText,
      onSelectionChange: (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
        setCaret(e.nativeEvent.selection.end);
        setForcedSelection(null);
      },
      ...(forcedSelection ? { selection: forcedSelection } : {}),
    },
  };
}
