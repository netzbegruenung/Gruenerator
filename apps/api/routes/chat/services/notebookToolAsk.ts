/**
 * „Will dieser Turn etwas MIT dem Notebook tun, statt es etwas zu fragen?" —
 * das Tor, das einen Turn mit gewähltem Notebook in die Schleife lässt, mit
 * `notebook_quellen` als erstem Werkzeugaufruf (Pin im Klassifikator).
 *
 * Ohne Treffer bleibt der Turn, wo er war: Einzeldurchlauf mit `searchNode`,
 * dessen Zitier- und Rerank-Verhalten gemessen ist. Deshalb verlangt das Tor
 * ein VERB (sortieren, zählen, lesen, zitieren, …) oder einen ausdrücklichen
 * ORT bzw. eine MENGE (Seite 3, Kapitel 2, wie viele Seiten, wörtlich) —
 * nie ein Nomen allein. „Zahlen", „Reihe", „Belege", „Liste", „Ordner",
 * „Entfernung" sind Nomen, die wie die Verben anfangen, und „zählt",
 * „ordnet", „entfernt" stehen in gewöhnlichen Inhaltsfragen — Verben zählen
 * deshalb nur als Imperativ oder im Bittrahmen („kannst du … sortieren").
 *
 * `\b` ist neben Umlauten tot (`\bzähl` scheitert), deshalb Lookarounds —
 * dasselbe Idiom wie `agenturaContext.ts`.
 */

/**
 * Die Schreibverben — EINE Liste für beide Tore: das Werkzeug-Tor unten und
 * `looksLikeNotebookWriteAsk`, das System-Notebooks (schreibgeschützt) vom Pin
 * ausnimmt. Zwei Listen drifteten schon einmal („notiere" fehlte der zweiten).
 */
const WRITE_IMPERATIVES = ['entferne?', 'verschiebe?', 'kopiere?', 'notiere?', 'tagge?'];
const WRITE_INFINITIVES = '(?:umbenennen|entfernen|verschieben|kopieren|notieren|taggen)';

/**
 * Was zwischen Verb und Nomen stehen darf: Artikel, Menge, Superlativ — „zeig
 * mir fünf Stellen", „die 10 neuesten Quellen", „die wichtigsten drei Quellen".
 * Nichts sonst, damit „zeig mir, wie …" und „die wichtigsten Unterschiede"
 * nicht treffen.
 */
const COUNT =
  '(?:\\d+|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|zw(?:ö|oe)lf|zwanzig)';
const AMOUNT = `(?:(?:die|alle)\\s+)?(?:${COUNT}\\s+)?(?:[a-zäöüß]+sten\\s+)?(?:${COUNT}\\s+)?`;

/**
 * Suchaufträge an ein Dokument: „such im Wahlprogramm nach …", „durchsuche das
 * Programm nach dem Begriff …", „such mir aus X die Stelle zu Y raus". „Suchen"
 * allein ist ein gewöhnliches Verb („Suche nach Lösungen für …", „such mir ein
 * Rezept raus") — es zählt nur mit einem SUCHZIEL hinter „nach" (Anführungszeichen,
 * Begriff, Satz, Stelle, …), einem DOKUMENT als Ort davor oder einer Stelle als
 * Gegenstand von „raus". „Ich suche …" ist eine Aussage, kein Auftrag.
 */
const SEARCH_VERB = '(?<!ich\\s{1,3})(?:durch)?such(?:e)?\\s+(?:mir\\s+)?';
const SEARCH_TARGET =
  '(?:(?:dem|den|der|die|das)\\s+)?(?:[„"»‚\'“]\\S*|begriff\\w*|w(?:ö|oe)rt\\w*|wort|s(?:a|ä|ae)tz\\w*|zitat\\w*|formulierung\\w*|stellen?|passagen?|textstellen?)';
const DOCUMENT_NOUN =
  '(?:notebook|dokument|quelle|wahlprogramm|programm|kapitel|koalitionsvertrag|antr(?:a|ä|ae)g|beschl(?:u|ü|ue)ss|pdf|protokoll|satzung|positionspapier|pressemitteilung)\\w*';
const SEARCH_ASKS = [
  `${SEARCH_VERB}[^.?!,]{0,80}?nach\\s+${SEARCH_TARGET}`,
  `${SEARCH_VERB}(?:(?:im|in|aus|das|die|den|dem|der|meinem|meiner|meinen|unserem|unserer)\\s+)*${DOCUMENT_NOUN}[^.?!,]{0,60}?(?<![\\wäöüß])nach(?![\\wäöüß])`,
  `${SEARCH_VERB}[^.?!,]{0,80}?(?<![\\wäöüß])(?:stellen?|passagen?|textstellen?|zitate?)(?![\\wäöüß])[^.?!,]{0,60}?(?<![\\wäöüß])(?:raus|heraus)`,
];

/**
 * Fundort-Fragen: „Auf welcher Seite steht …", „Welche Seiten …". „Seite" ist
 * doppeldeutig — „Auf welcher Seite stehen die Grünen in der Debatte?" fragt
 * nach einer Position, nicht nach einem Blatt. Deshalb zählt die Frage nur mit
 * einem Dokument-Bezug im selben Satz: ein Zitat in Anführungszeichen, ein
 * Dokument als Ort („im Antrag", „des Programms"), ein Textstück als
 * Gegenstand (Begriff, Zitat, die Stelle, …) oder ein Verb, das nur Texte tun
 * („erwähnt", „genannt", „geht es um") — nicht über ein Komma hinweg, außer
 * „steht/heißt es, dass". „Seitenzahl" ist eindeutig.
 */
/**
 * Dokument-Nomen für den Seiten-Anker: nur Flexionsendungen, keine beliebigen
 * Komposita — „Programmdebatte", „Satzungsfrage", „Antragsteller" sind keine
 * Dokumente. Die gebräuchlichen Komposita stehen ausgeschrieben da.
 */
const PAGE_DOCUMENT_NOUN =
  '(?:notebook|dokument|quelle|(?:wahl|grundsatz|regierungs)?programm|kapitel|koalitionsvertr(?:a|ä|ae)g|antr(?:a|ä|ae)g|beschl(?:u|ü|ue)ss|pdf|protokoll|satzung|positionspapier|pressemitteilung)(?:e|en|es|n|s)?';
const PAGE_ANCHOR = [
  '[„"»‚\'“]\\S*',
  `(?<![\\wäöüß])(?:im|in|aus|vom|von|des)\\s+(?:(?:dem|der|den|des|diesem|dieser|dieses|meinem|meiner|meines|unserem|unserer|unseres)\\s+)?${PAGE_DOCUMENT_NOUN}`,
  // „Stelle(n)" nur als Nomen mit Begleiter — „welche Forderungen stellen sie" ist ein Verb.
  '(?<![\\wäöüß])(?:(?:die|den|der|diese[rn]?|alle[rn]?|\\d+)\\s+stellen?|textstellen?)',
  '(?<![\\wäöüß])(?:begriff\\w*|wort|w(?:ö|oe)rter|zitat\\w*|satz|s(?:ä|ae)tze|formulierung\\w*|passagen?|absatz|abs(?:ä|ae)tze|tabellen?|grafik\\w*|abbildung\\w*)',
  '(?<![\\wäöüß])(?:erw(?:ä|ae)hnt|genannt|behandelt|beschrieben|thematisiert|aufgef(?:ü|ue)hrt|zitiert|definiert|geht\\s+es\\s+um)',
  // „…, dass" nur hinter einem Verb des Geschriebenen — „welche Seite behauptet, dass" ist ein Streit.
  '(?<![\\wäöüß])(?:steht|hei(?:ß|ss)t(?:\\s+es)?|findet\\s+sich)\\s*,\\s*dass',
].join('|');
const PAGE_ASKS = [
  `(?:(?:auf|in)\\s+welche[rn]?|welche)\\s+seiten?(?![\\wäöüß])[^.?!;,]{0,100}?(?:${PAGE_ANCHOR})`,
  'seitenzahl(?:en)?\\s+(?:von|f(?:ü|ue)r|zu|zum|zur|dazu)',
];

const REQUEST_INFINITIVES = `(?:sortieren|z(?:ä|ae)hlen|ordnen|auflisten|vorlesen|(?:ö|oe)ffnen|zitieren|${WRITE_INFINITIVES})`;

/** Bittrahmen mit Infinitiv — nicht über ein Komma hinweg. */
const requestFrame = (infinitives: string): string =>
  `(?:kannst|k(?:ö|oe)nntest|w(?:ü|ue)rdest|bitte)\\s+[^.?!,]{0,80}?(?<![\\wäöüß])${infinitives}`;

const NOTEBOOK_TOOL_ASK = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [
      // ── Verben — nur Imperativ ──
      // Keine `-t`/`-en`-Endungen: „was zählt als …", „wie ordnet das
      // Programm …", „vom Ziel entfernt", „zum Entfernen von …" sind
      // Inhaltsfragen. Den Infinitiv deckt nur der Bittrahmen darunter.
      'sortiere?',
      'ordne',
      'reihe?\\s+(?:mir\\s+)?(?:die|alle|sie)',
      'z(?:ä|ae)hle?',
      'liste?\\s+(?:mir\\s+)?(?:alle|die)',
      'lies',
      '(?:ö|oe)ffne',
      // „dann": der zweite Teil eines Auftrags („Welche Kategorien gibt es?
      // Zeig mir dann alle Quellen …", #3627).
      `zeige?\\s+(?:mir\\s+)?(?:dann\\s+)?${AMOUNT}(?:seiten?|quellen?|stellen?|gliederung|inhaltsverzeichnis)`,
      // „Nenne mir die 10 relevantesten Quellen" — nur mit Quellen als Gegenstand:
      // „nenne mir die wichtigsten Forderungen" ist eine Inhaltsfrage.
      `nenne?\\s+(?:mir\\s+)?${AMOUNT}quellen`,
      'belege?\\s+(?:mir\\s+|bitte\\s+)?(?:das|dies\\w*|die|es|mit)',
      'zitiere?',
      // „Ich finde die Stelle gut" ist eine Meinung, kein Suchauftrag.
      '(?<!ich\\s{1,3})finde?\\s+(?:mir\\s+)?(?:die\\s+)?(?:stelle|passage|textstelle|das\\s+zitat)',
      // „Finde im Notebook die fünf Stellen …" — Wörter dazwischen, aber nicht
      // „finde ich" und nicht über ein Komma („Ich finde, an mehreren Stellen …").
      '(?<!ich\\s{1,3})finde?\\s+(?!ich(?![\\wäöüß]))[^.?!,]{0,60}?(?<![\\wäöüß])(?:stellen|passagen|textstellen)',
      ...SEARCH_ASKS,
      ...WRITE_IMPERATIVES,
      // Bittrahmen mit Infinitiv: „kannst du die Quellen sortieren", „bitte
      // alle Anträge auflisten". Nicht über ein Komma hinweg — „kannst du mir
      // sagen, welche Maßnahmen zählen" ist wieder eine Inhaltsfrage.
      requestFrame(REQUEST_INFINITIVES),
      // ── Orte und Mengen ──
      // „wie oft" nur als Zählauftrag — „wie oft wird der Vorstand gewählt"
      // ist eine Inhaltsfrage. „vor"/„auf" nur als abgetrennte Vorsilbe am
      // Satz- oder Teilsatzende („kommt … vor?", „kommt … vor, und …"), nicht
      // als Präposition („steht vor Gericht") und nicht vor einem Nebensatz
      // („kommt es vor, dass …" ist eine Inhaltsfrage).
      'wie\\s+oft\\s+(?:wird|kommt|taucht|steht)\\s+[^.?!]{0,80}?(?<![\\wäöüß])(?:erw(?:ä|ae)hnt|genannt|verwendet|(?:vor|auf)(?=\\s*(?:[.?!;]|,(?!\\s*(?:dass|wenn|ob)(?![\\wäöüß]))|$)))',
      'wie\\s+viele\\s+(?:w(?:ö|oe)rter|seiten|quellen|dokumente|treffer)',
      'seite\\s+\\d+',
      ...PAGE_ASKS,
      'abschnitt\\s+\\d+',
      'kapitel\\s+\\d+',
      'w(?:ö|oe)rtlich',
      // Nur hinter einem Sortier-Partizip — „je nach Datum des Antrags" ist
      // eine Inhaltsfrage.
      '(?:sortiert|geordnet|gereiht|gruppiert)\\s+nach\\s+(?:datum|name|l(?:ä|ae)nge|seiten|relevanz)',
      '(?:quellen?|dokumente?)\\s+(?:ist|sind)\\s+(?:die|das|am)\\s+(?:l(?:ä|ae)ngst|k(?:ü|ue)rzest|neuest|(?:ä|ae)ltest)\\w*',
      // Rangfolge nach Relevanz — nur mit Quellen als Gegenstand.
      '(?:quellen?|dokumente?)\\s+[^.?!,]{0,60}?am\\s+relevantesten',
      // Filter nach dem Titel — nur mit Quellen als Gegenstand: „was bedeutet
      // das Wort im Titel des Programms" ist eine Inhaltsfrage.
      '(?:quellen?|dokumente?)\\s+[^.?!,]{0,60}?im\\s+titel',
    ].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function looksLikeNotebookToolAsk(text: string | null | undefined): boolean {
  if (!text) return false;
  return NOTEBOOK_TOOL_ASK.test(text);
}

/**
 * Die Schreib-Teilmenge: Quellen entfernen, verschieben, kopieren, notieren,
 * umbenennen, taggen — aus denselben Listen wie das Werkzeug-Tor oben.
 * System-Notebooks sind schreibgeschützt; ein solcher Auftrag an eines bekommt
 * keinen Pin auf ein Werkzeug, das nur ablehnen kann.
 */
const NOTEBOOK_WRITE_ASK = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [...WRITE_IMPERATIVES, requestFrame(WRITE_INFINITIVES)].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function looksLikeNotebookWriteAsk(text: string | null): boolean {
  if (!text) return false;
  return NOTEBOOK_WRITE_ASK.test(text);
}
