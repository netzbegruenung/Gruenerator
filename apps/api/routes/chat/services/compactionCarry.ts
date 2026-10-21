/**
 * Was eine Zusammenfassung nicht ersetzen darf: der zuletzt geschriebene
 * Langtext und das Material, das die Person eingefügt hat.
 *
 * `prepareMessagesWithCompaction` behält die Nachrichten nach der Grenze der
 * Zusammenfassung wörtlich und ersetzt alles davor durch Prosa. Für
 * Gesprächsverlauf ist das richtig; für ein ERGEBNIS oder eine QUELLE ist es
 * Totalverlust. Eine Pressemitteilung aus Runde 2, auf die sich Runde 15
 * bezieht, existiert dann nur noch als „der Assistent hat eine Pressemitteilung
 * zu Solarenergie verfasst" — und das Modell schreibt sie neu statt sie zu
 * ändern. Eine eingefügte Pressemitteilung, aus der Runde 15 zitieren soll,
 * existiert gar nicht mehr (#4790).
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

/** Deckel für den Langtext (~3.400 Token), unabhängig vom Budget des Aufrufers:
 *  ein einzelner Entwurf darf das Material daneben nicht verdrängen. */
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
  kept: readonly CarryMessage[],
  maxChars = CARRY_MAX_CHARS
): string | null {
  for (const message of kept) {
    if (longFormText(message)) return null;
  }

  for (let i = dropped.length - 1; i >= 0; i--) {
    const text = longFormText(dropped[i]);
    if (!text) continue;
    return capped(text, Math.min(maxChars, CARRY_MAX_CHARS));
  }

  return null;
}

function capped(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + TRUNCATION_MARK;
}

/**
 * Eingefügtes Material aus dem weggeschnittenen Teil, in Reihenfolge — oder [].
 *
 * Anders als beim Langtext ist hier jeder Text eine eigene Quelle, keine ältere
 * Fassung desselben: mitgenommen wird deshalb alles, was ins Budget passt, die
 * jüngsten zuerst. Ein Paste unter 3.000 Zeichen hat keine Anhang-Zeile
 * (`inlineMaterialAttachment`), ohne diesen Weg wäre er nach der ersten
 * Zusammenfassung weg.
 */
export function selectCarriedMaterial(
  dropped: readonly CarryMessage[],
  maxChars: number
): string[] {
  const picked: string[] = [];
  let left = maxChars;
  for (let i = dropped.length - 1; i >= 0 && left >= LONG_FORM_MIN_CHARS; i--) {
    if (dropped[i].role !== 'user') continue;
    const text = textOf(dropped[i].content).trim();
    if (text.length < LONG_FORM_MIN_CHARS) continue;
    const kept = capped(text, left);
    picked.unshift(kept);
    left -= kept.length;
  }
  return picked;
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

export function renderMaterialBlock(texts: readonly string[]): string {
  return `## EINGEFÜGTES MATERIAL (WÖRTLICH)

Diese Texte hat die Person früher in diesem Gespräch eingefügt. Die Zusammenfassung gibt sie nur sinngemäß wieder; für Zitate, Zahlen und Formulierungen gilt dieser Wortlaut:

${texts.join('\n\n---\n\n')}`;
}
