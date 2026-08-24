/**
 * Was eine Zusammenfassung nicht ersetzen darf: der zuletzt geschriebene Langtext.
 *
 * `prepareMessagesWithCompaction` behält `getKeepRecent()` Nachrichten wörtlich
 * (20 auf den grossen Lanes) und ersetzt alles davor durch ~800 Token Prosa.
 * Für Gesprächsverlauf ist das richtig; für ein ERGEBNIS ist es Totalverlust.
 * Eine Pressemitteilung aus Runde 2, auf die sich Runde 15 bezieht, existiert
 * dann nur noch als „der Assistent hat eine Pressemitteilung zu Solarenergie
 * verfasst" — und das Modell schreibt sie neu statt sie zu ändern.
 *
 * Mehr Budget verschiebt nur, WANN das passiert: die Grenze ist eine
 * Nachrichten-ANZAHL, keine Tokenzahl. Deshalb sitzt die Rettung hier und nicht
 * an einer Schwelle.
 *
 * ZWEI DINGE, DIE DIESE DATEI NICHT IST.
 *
 * (1) Kein Artefakt-Inventar. Dokumente, Präsentationen, Tabellen, PDFs, Bilder
 *     und Sharepics haben bereits einen Weg zurück ins Modell — `createdDocument`
 *     rehydriert aus dem Dokumentenspeicher, und `artifactInventory.ts` legt die
 *     Liste in den Systemprompt. Was keinen Weg hat, ist reiner Chat-Langtext:
 *     eine Pressemitteilung, die als Antwort im Faden steht und sonst nirgends.
 *     Genau die Lücke füllt diese Datei, und nur die.
 *
 * (2) Keine Inhaltserkennung. Es gibt keinen Marker, an dem man ein Ergebnis
 *     erkennen könnte: `metadata` ist Render-Kanal und überlebt
 *     `convertToModelMessages` nicht, also sieht dieser Pfad nur Rolle und Text.
 *     Das Kriterium ist deshalb Länge — bewusst grob, mit einer Regel daneben,
 *     die den teuren Fehlerfall ausschliesst (siehe `selectCarriedLongForm`).
 *
 * Der Text landet im Systemprompt, nicht in der Nachrichtenliste. Eine
 * Assistenten-Nachricht vor das Fenster zu setzen erzeugt je nach Rest zwei
 * Assistenten-Nachrichten hintereinander, was Mistral ablehnt; der Systemprompt
 * ist ausserdem die Naht, die die Zusammenfassung selbst schon benutzt — der
 * wörtliche Text steht damit direkt neben der Prosa, die ihn andernfalls ersetzt.
 */

import { extractTextContent } from './messageHelpers.js';

/** Ab wann eine Antwort ein Ergebnis ist und nicht Gesprächsverlauf. Eine
 *  Pressemitteilung liegt bei ~3.000 Zeichen, ein Social-Post bei ~600; die
 *  Grenze trennt „geschriebener Text" von „Rückfrage/Bestätigung". */
const LONG_FORM_MIN_CHARS = 1200;

/** Deckel für das, was der Block dem Systemprompt hinzufügt (~3.400 Token).
 *  Die Zusammenfassung daneben kostet 800 — das Ergebnis darf mehr, aber nicht
 *  so viel, dass die Rettung selbst das Fenster sprengt. */
const CARRY_MAX_CHARS = 12_000;

const TRUNCATION_MARK = '\n\n[… hier gekürzt]';

interface CarryMessage {
  role: string;
  content?: unknown;
}

/** Text einer Nachricht, egal ob String oder Parts-Array. Andere Formen
 *  (null, Objekt) zählen als leer statt zu werfen — dieser Pfad darf einen
 *  Turn nie kippen. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return extractTextContent(content as Parameters<typeof extractTextContent>[0]);
  }
  return '';
}

/** Der Langtext dieser Nachricht, oder null wenn sie keiner ist. */
function longFormText(message: CarryMessage): string | null {
  if (message.role !== 'assistant') return null;
  const text = textOf(message.content).trim();
  return text.length >= LONG_FORM_MIN_CHARS ? text : null;
}

/**
 * Der eine Langtext, der die Kürzung überleben muss — oder null.
 *
 * Zwei Regeln, und die zweite ist die wichtigere:
 *
 * 1. Der JÜNGSTE Langtext aus dem weggeschnittenen Teil. Ältere Fassungen
 *    desselben Textes sind bereits überholt; sie mitzunehmen hiesse dem Modell
 *    mehrere Entwürfe ohne Reihenfolge vorzulegen.
 * 2. NUR, wenn im behaltenen Fenster gar kein Langtext mehr steht. Steht dort
 *    einer, hat das Modell bereits aktuelles Material, und ein älterer Entwurf
 *    daneben ist kein Gewinn, sondern eine Verwechslungsgefahr — im typischen
 *    Verlauf („PM schreiben, dann drei Runden ändern") ist die jüngste Fassung
 *    ohnehin im Fenster, und diese Funktion liefert korrekt null.
 *
 * Der Preis der zweiten Regel ist ehrlich zu nennen: steht im Fenster ein langer
 * Recherchetext und davor die Pressemitteilung, geht die PM trotzdem verloren.
 * Ohne Marker am Inhalt lässt sich das nicht unterscheiden, und ein stiller
 * Fehlgriff („hier ist dein Ergebnis" + falscher Text) ist teurer als ein
 * stiller Verzicht.
 *
 * @param dropped  die Nachrichten VOR dem behaltenen Fenster, in Reihenfolge
 * @param kept     das behaltene Fenster
 * @returns der Text, ggf. gekürzt und markiert, oder null
 */
export function selectCarriedLongForm(
  dropped: readonly CarryMessage[],
  kept: readonly CarryMessage[]
): string | null {
  for (const message of kept) {
    if (longFormText(message)) return null;
  }

  for (let i = dropped.length - 1; i >= 0; i--) {
    const text = longFormText(dropped[i]);
    if (!text) continue;
    return text.length <= CARRY_MAX_CHARS ? text : text.slice(0, CARRY_MAX_CHARS) + TRUNCATION_MARK;
  }

  return null;
}

/**
 * Der Block, der zwischen Zusammenfassung und „die folgenden Nachrichten"
 * steht. Sagt beides ausdrücklich: dass der Text schon existiert (damit er
 * nicht neu geschrieben wird) und dass er wörtlich ist (damit die Prosa
 * darüber nicht als die genauere Fassung gelesen wird).
 */
export function renderCarryBlock(text: string): string {
  return `## BEREITS GESCHRIEBENER TEXT (WÖRTLICH)

Diesen Text hast du in diesem Gespräch bereits verfasst. Er liegt vor den unten stehenden Nachrichten, die Zusammenfassung gibt ihn nur sinngemäß wieder. Bezieht sich die Anfrage darauf, arbeite an DIESER Fassung weiter — schreibe sie nicht ungefragt neu:

${text}`;
}
