import { type Mentionable } from './mentionables';

/**
 * Brücke von Bedienelementen außerhalb des Composers (Rezept-Starter im leeren
 * Chat) zu dessen Mention-Auswahl. Der Composer hört zu und ruft seine eigene
 * `handleSelect` — dieselbe Aktivierung samt Chip wie im @-Menü und im
 * Plus-Menü, also auch dasselbe Aufräumen beim Entfernen des Chips.
 */
type Listener = (mentionable: Mentionable) => void;

const listeners = new Set<Listener>();

export function requestMention(mentionable: Mentionable): void {
  listeners.forEach((l) => l(mentionable));
}

export function onMentionRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
