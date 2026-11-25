import { type Mentionable } from './mentionables';

/**
 * Brücke von Bedienelementen außerhalb des Composers (Rezept-Starter im leeren
 * Chat, Rezept-Deeplink `/chat?rezept=…`) zu dessen Mention-Auswahl. Der
 * Composer hört zu und ruft seine eigene `handleSelect` — dieselbe Aktivierung
 * samt Chip wie im @-Menü und im Plus-Menü, also auch dasselbe Aufräumen beim
 * Entfernen des Chips.
 *
 * Hört gerade kein Composer zu (der Deeplink kommt vor dem Composer an), bleibt
 * die letzte Anfrage liegen und geht an den nächsten, der sich anmeldet.
 */
type Listener = (mentionable: Mentionable) => void;

const listeners = new Set<Listener>();
let pending: Mentionable | null = null;

export function requestMention(mentionable: Mentionable): void {
  if (listeners.size === 0) {
    pending = mentionable;
    return;
  }
  pending = null;
  listeners.forEach((l) => l(mentionable));
}

export function onMentionRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const next = pending;
    pending = null;
    listener(next);
  }
  return () => {
    listeners.delete(listener);
  };
}
