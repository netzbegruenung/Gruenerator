/**
 * Steht der Gegenstand der Frage überhaupt in einer der gesammelten Quellen?
 *
 * „Was sagen die Grünen zur Marskolonie-Steuer?" fand das Regierungsprogramm
 * (Milliardärssteuer) und zwei Web-Treffer über den Mars. Der Schreiber machte
 * daraus „… treten damit der Kritik entgegen, solche Steuern könnten eine
 * Marsbesiedlung gefährden [2]" — eine erfundene Aussage mit dem Beleg eines
 * echten Parteiprogramms, das den Mars nicht erwähnt (#5141). Die Regel
 * „Deckt keine Quelle die Frage, sag es ehrlich" griff nicht: die Quellen
 * deckten ein Nachbarthema, und das reichte dem Modell.
 *
 * Diese Prüfung ist bewusst eng: Kandidat ist nur ein großgeschriebenes Wort ab
 * sieben Buchstaben direkt hinter einer Präposition, die den Gegenstand
 * einleitet („zur Marskolonie-Steuer", „über die Wärmeplanung"). Ein
 * allgemeines Wort wie „Unterschied" oder „Wahlprogramm" darf keine Absage
 * auslösen. Die Notiz verbietet deshalb keine Antwort, nur den Beleg für den
 * Gegenstand ohne eine Quelle, die ihn wörtlich oder sinngemäß nennt.
 */

/** Wörter, die eine Frage rahmen, aber nicht ihr Gegenstand sind. */
const FRAME_TERMS = new Set(
  [
    'wahlprogramm',
    'grundsatzprogramm',
    'regierungsprogramm',
    'parteiprogramm',
    'programm',
    'position',
    'positionen',
    'haltung',
    'meinung',
    'standpunkt',
    'forderung',
    'forderungen',
    'beschluss',
    'beschlusslage',
    'antrag',
    'antraege',
    'informationen',
    'unterschied',
    'unterschiede',
    'bundestag',
    'landtag',
    'nationalrat',
    'fraktion',
    'bundestagsfraktion',
    'landesverband',
    'pressemitteilung',
    'zusammenfassung',
    'thema',
    'themen',
  ].map(normalize)
);

const SUBJECT_PREPOSITION =
  /(?<!\p{L})(?:zu|zum|zur|über|gegen|gegenüber|bei|von|vom|zwischen)\s+((?:\S+\s+){0,3}\S+)/giu;
const CANDIDATE = /\p{Lu}\p{L}{6,}/gu;
const MAX_QUESTION_CHARS = 400;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue');
}

/** Höchstens eine Einfügung, Löschung oder Ersetzung — „Vermögenssteuer" ≈ „Vermögensteuer". */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Ein Kompositum, dessen beide Teile in den Quellen stehen, ist sinngemäß
 * gedeckt: „Vermögensteuer" bei „Steuern aus großen Vermögen". Live am
 * 29.10.2026 begann eine Antwort sonst mit „keine Informationen zum Begriff
 * Vermögensteuer", obwohl das Grundsatzprogramm genau das forderte. Für
 * „Marskolonie" fehlt „kolonie" — die Lücke bleibt.
 */
function partsCovered(term: string, text: string): boolean {
  const MIN_PART = 4;
  for (let i = MIN_PART; i <= term.length - MIN_PART; i++) {
    const head = term.slice(0, i);
    const tail = term.slice(i);
    if (!text.includes(head)) continue;
    if (text.includes(tail)) return true;
    // Fugen-s: „vermoegens|teuer" → „vermoegen" + „steuer" prüft schon i-1; hier
    // der Fall, dass das s am Kopf hängt.
    if (head.endsWith('s') && tail.length >= MIN_PART && text.includes(`s${tail}`)) return true;
  }
  return false;
}

function isCovered(term: string, text: string, words: ReadonlySet<string>): boolean {
  // Flexion und Komposita: „Wehrpflicht" steckt in „Wehrpflichtigen", „Klimageld" in „Klimageldes".
  const stem = term.replace(/(?:en|es|er|e|n|s)$/u, '');
  if (text.includes(stem)) return true;
  for (const w of words) if (withinOneEdit(w, term)) return true;
  return partsCovered(stem, text);
}

/**
 * Gegenstands-Wörter der Frage, die in keiner Quelle vorkommen — auch nicht in
 * naher Schreibweise. Leer, wenn es keine Quellen gibt, die Frage ein langer
 * Einschub ist oder alles gedeckt ist.
 */
export function missingQuestionTerms(question: string, sourcesText: string): string[] {
  if (!question || question.length > MAX_QUESTION_CHARS || sourcesText.trim() === '') return [];
  const candidates = new Set<string>();
  for (const phrase of question.matchAll(SUBJECT_PREPOSITION)) {
    for (const term of phrase[1]?.match(CANDIDATE) ?? []) {
      if (!FRAME_TERMS.has(normalize(term))) candidates.add(term);
    }
  }
  if (candidates.size === 0) return [];
  const text = normalize(sourcesText);
  const words = new Set(text.match(/\p{L}{6,}/gu) ?? []);
  return [...candidates].filter((term) => !isCovered(normalize(term), text, words));
}

/** Die Schreiber-Notiz zu {@link missingQuestionTerms}, oder `''`. */
export function buildUncoveredTermNote(question: string, sourcesText: string): string {
  const missing = missingQuestionTerms(question, sourcesText);
  if (missing.length === 0) return '';
  const terms = missing.map((t) => `„${t}“`).join(', ');
  return `\n\nGEGENSTAND OHNE QUELLE: ${terms} aus der Frage steht wörtlich in keiner der Quellen. Belege eine Aussage über ${terms} nur mit einer Quelle, die genau diesen Gegenstand nennt — wörtlich oder unmissverständlich mit anderen Worten. Nennt ihn keine Quelle, sag das, und verknüpfe Nachbarthemen der Quellen nicht mit ${terms}: schreibe keiner Partei eine Haltung dazu zu, die nicht dasteht.`;
}
