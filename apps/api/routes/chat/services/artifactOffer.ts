/**
 * Das EINE Angebot am Ende einer Antwort („Soll ich daraus eine Präsentation
 * machen?") und das knappe „ja" danach (#4367).
 *
 * Welches Angebot passt, entscheidet der Server, nicht das Modell: das Rezept,
 * das den Text geformt hat, bestimmt die Art. Ein frei formuliertes Angebot
 * hätte sich nicht verlässlich wiedererkennen lassen — „ja gern" baute dann
 * nichts, oder das Modell erfand Vorlagen, die es nicht gibt (Live-Test
 * 10.10.2026). So steht fest, was angeboten wurde: der Prompt bekommt die
 * Rückfrage, die Nachricht speichert die Art (`metadata.offer`), und der
 * nächste Turn liest sie als `lastTurnOffer`.
 */

import { SKILLS } from '@gruenerator/shared/agents';

import { vorlagenOfferNote } from '../agents/vorlagenTools.js';

import { compoundGenerationKind } from './agenticLoop/routing.js';
import { ARTIFACT_KINDS, artifactKind, type ArtifactKindId } from './artifactKindRegistry.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/** Rezept-Kategorie → angebotene Art. Was fehlt, bekommt kein Angebot. Eine
 *  `Map` statt eines Objekts: die Mentions angelernter Textformen wählen
 *  Nutzer*innen selbst, und „constructor" fände in einem Objekt-Literal einen
 *  geerbten Eintrag. */
const OFFER_BY_CATEGORY: ReadonlyMap<string, ArtifactKindId> = new Map([
  ['social', 'sharepic'],
  ['presse', 'document'],
  ['dokumente', 'document'],
]);

/** Ausnahmen innerhalb einer Kategorie: ein Reel ist Video, eine
 *  Reisekostenabrechnung ein Formular, ein Sprechzettel wird vorgetragen. */
const OFFER_BY_MENTION: ReadonlyMap<string, ArtifactKindId | null> = new Map([
  ['reel', null],
  ['reisekosten-nrw', null],
  ['reisekosten-nrw-vorbereiten', null],
  ['sprechzettel', 'presentation'],
]);

function offerForMention(mention: string): ArtifactKindId | null {
  const key = mention.toLowerCase();
  if (OFFER_BY_MENTION.has(key)) return OFFER_BY_MENTION.get(key) ?? null;
  const category = SKILLS.find((s) => s.mention.toLowerCase() === key)?.skillCategory;
  return (category && OFFER_BY_CATEGORY.get(category)) || null;
}

/** Die Art, die nach einem Text dieser Rezepte angeboten wird — das erste
 *  Rezept mit einem Angebot gewinnt, damit es nie zwei Rückfragen gibt. */
export function offerKindForRecipes(mentions: readonly string[]): ArtifactKindId | null {
  for (const mention of mentions) {
    const kind = offerForMention(mention);
    if (kind) return kind;
  }
  return null;
}

const OFFER_EXAMPLE: Readonly<Record<ArtifactKindId, string>> = {
  sharepic: 'Soll ich daraus ein Sharepic machen?',
  presentation: 'Soll ich daraus eine Präsentation machen?',
  sheet: 'Soll ich daraus eine Tabelle machen?',
  board: 'Soll ich daraus ein Board machen?',
  pdf: 'Soll ich daraus ein PDF machen?',
  explainable: 'Soll ich daraus ein Explainable machen?',
  document: 'Soll ich daraus ein Dokument machen, das du bearbeiten und teilen kannst?',
};

/**
 * Die EINE Rückfrage für den Prompt, oder ''. Hängt an jeder Stelle, an der ein
 * Rezept in den Prompt kommt (Einzeldurchlauf, Loop einheitlich und geteilt).
 *
 * Nach einem Social-Post gewinnt die Vorlagen-Galerie (`vorlagenOfferNote`):
 * aus einer Vorlage wird mit einem Klick ein Sharepic mit dem Text. Das
 * Sharepic-Angebot ist der Rückfall, wenn es für das Land keine Vorlagen gibt
 * oder ein Agent sie abgeschaltet hat — und entfällt, wenn die Galerie in
 * diesem Turn schon gezeigt wurde. Die Frage nennt die Art beim Namen; daran
 * prüft `offerToRecord`, ob das Modell sie wirklich gestellt hat.
 */
export function offerNote(
  state: Pick<ChatGraphState, 'userLocale' | 'vorlagenShown' | 'enabledTools'>,
  recipeMentions: readonly string[]
): string {
  const vorlagen = vorlagenOfferNote(state, recipeMentions);
  if (vorlagen) return vorlagen;
  const kind = offerKindForRecipes(recipeMentions);
  if (!kind) return '';
  if (kind === 'sharepic' && state.vorlagenShown?.length) return '';
  if (state.enabledTools?.[artifactKind(kind).loopToolName] === false) return '';
  return `\n\nABSCHLUSS: Ist der Text fertig und wurde in diesem Turn noch kein ${artifactKind(kind).label} erstellt, schließe mit genau EINER kurzen Rückfrage: „${OFFER_EXAMPLE[kind]}" Keine andere Rückfrage, kein weiteres Angebot.`;
}

/** Der letzte Satz, der eine Frage ist — dort steht das Angebot. */
function lastQuestion(text: string): string | null {
  const questions = text.match(/[^.!?\n]*\?/g);
  return questions?.at(-1) ?? null;
}

/** Ein Angebot, das nicht als Frage endet: „Ich kann dir … erstellen. Gib mir
 *  einfach Bescheid, ob ich das übernehmen soll!" (live 15.10.2026). */
const OFFER_CUE_RE =
  /\b(?:soll(?:en)?\s+(?:ich|wir)|kann\s+ich|ich\s+kann\s+(?:dir|euch|ihnen)|m[öo]chtest\s+du|willst\s+du|magst\s+du|bescheid)\b/i;

/** Der Schlussabsatz, wenn er ein Angebot macht. */
function closingOffer(text: string): string | null {
  const last = text
    .trim()
    .split(/\n\s*\n/)
    .at(-1)
    ?.trim();
  return last && OFFER_CUE_RE.test(last) ? last : null;
}

/**
 * Was in `metadata.offer` gespeichert wird: die Art nur, wenn das Angebot am
 * Ende der Antwort sie wirklich nennt und der Turn sie nicht schon gebaut hat.
 * Sonst baute ein „ja" etwas, das niemand angeboten hat.
 *
 * Das Angebot steht in der letzten Frage oder, ohne Fragezeichen, im
 * Schlussabsatz mit einer Angebotswendung. Welche Art es ist:
 *  - die des Rezepts, wenn das Angebot ihr Label nennt (die vorgegebene
 *    Rückfrage aus `offerNote`);
 *  - ohne Rezept das noch offene Angebot des Turns davor: eine Überarbeitung
 *    („mach den zweiten Absatz kürzer") lädt kein Rezept, wiederholt aber die
 *    Rückfrage — ohne Übertrag lief das „ja" danach ins Leere;
 *  - sonst die Art, deren ERSTELLUNG das Angebot formuliert — dasselbe Prädikat
 *    wie für einen Auftrag (`compoundGenerationKind`). Die Prompt-Regeln
 *    (`NO_GRAPHICS_DENIAL_RULE`, `NO_HANDMADE_FILE_NOTE`) lassen das Modell
 *    auch ohne Rezept anbieten, und deren „ja" lief bis 15.10.2026 ins Leere.
 *    Ein Angebot, das ein vorhandenes Artefakt nur ändert („Soll ich die
 *    Tabelle um eine Spalte ergänzen?"), ist keine Erstellung und bleibt
 *    ungespeichert.
 */
export function offerToRecord(opts: {
  recipeMentions: readonly string[];
  text: string;
  producedArtifact: boolean;
  pendingOffer?: ArtifactKindId | null;
}): { kind: ArtifactKindId } | null {
  if (opts.producedArtifact) return null;
  const passages = [lastQuestion(opts.text), closingOffer(opts.text)].filter(
    (p): p is string => p != null
  );
  if (passages.length === 0) return null;
  // „Soll ich dir passende Sharepic-Vorlagen zeigen?" nennt das Sharepic, ist
  // aber das Galerie-Angebot — dessen „ja" nimmt `acceptsVorlagenOffer` an.
  if (passages.some((p) => p.toLowerCase().includes('vorlage'))) return null;
  const expected = offerKindForRecipes(opts.recipeMentions) ?? opts.pendingOffer ?? null;
  if (expected) {
    const label = artifactKind(expected).label.toLowerCase();
    if (passages.some((p) => p.toLowerCase().includes(label))) return { kind: expected };
  }
  for (const passage of passages) {
    const kind = compoundGenerationKind('produktion', passage);
    if (kind) return { kind };
  }
  return null;
}

/** `metadata.offer` zurückgelesen — nur bekannte Arten, alles andere ist null. */
export function parseRecordedOffer(raw: unknown): ArtifactKindId | null {
  const kind = (raw as { kind?: unknown } | null | undefined)?.kind;
  return ARTIFACT_KINDS.some((k) => k.id === kind) ? (kind as ArtifactKindId) : null;
}

/**
 * Eine Zusage ohne eigenen Gegenstand: „ja", „ja gern", „ok, mach das",
 * „bitte". Am Ende verankert, damit „ja, aber kürzer" eine Änderung bleibt und
 * kein Auftrag für das angebotene Artefakt wird. Ohne „super", „gut", „danke":
 * „super, danke" schließt ab, es bestellt nichts.
 */
const OFFER_ACCEPT =
  /^\s*(?:(?:ja|jo|jep|jap|yes|gerne?|klar|na klar|ok(?:ay)?|okey|bitte|unbedingt|auf jeden fall|sehr|mach(?:e|'?s)?|leg los|los|das|es|mal|doch|dann)(?:[\s,!.]+|$))+$/iu;

export function acceptsOffer(userText: string): boolean {
  const text = userText.trim();
  return text.length > 0 && text.length <= 60 && OFFER_ACCEPT.test(text);
}

const OFFER_TOPIC_MAX_CHARS = 2000;

/** Worum das Artefakt gehen soll: die vorige Antwort ohne ihre Rückfrage. */
export function offerTopic(lastAssistantText: string): string {
  const question = lastQuestion(lastAssistantText);
  const body = question
    ? lastAssistantText.slice(0, lastAssistantText.lastIndexOf(question))
    : lastAssistantText;
  return body.trim().slice(0, OFFER_TOPIC_MAX_CHARS);
}
