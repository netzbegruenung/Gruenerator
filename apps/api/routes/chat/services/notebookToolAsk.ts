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
      'zeige?\\s+(?:mir\\s+)?(?:die\\s+)?(?:seiten?|quellen?|stellen?|gliederung|inhaltsverzeichnis)',
      'belege?\\s+(?:mir\\s+|bitte\\s+)?(?:das|dies\\w*|die|es|mit)',
      'zitiere?',
      // „Ich finde die Stelle gut" ist eine Meinung, kein Suchauftrag.
      '(?<!ich\\s{1,3})finde?\\s+(?:mir\\s+)?(?:die\\s+)?(?:stelle|passage|textstelle|das\\s+zitat)',
      // „Finde im Notebook die fünf Stellen …" — Wörter dazwischen, aber nicht
      // „finde ich" und nicht über ein Komma („Ich finde, an mehreren Stellen …").
      '(?<!ich\\s{1,3})finde?\\s+(?!ich(?![\\wäöüß]))[^.?!,]{0,60}?(?<![\\wäöüß])(?:stellen|passagen|textstellen)',
      ...WRITE_IMPERATIVES,
      // Bittrahmen mit Infinitiv: „kannst du die Quellen sortieren", „bitte
      // alle Anträge auflisten". Nicht über ein Komma hinweg — „kannst du mir
      // sagen, welche Maßnahmen zählen" ist wieder eine Inhaltsfrage.
      requestFrame(REQUEST_INFINITIVES),
      // ── Orte und Mengen ──
      // „wie oft" nur als Zählauftrag — „wie oft wird der Vorstand gewählt"
      // ist eine Inhaltsfrage. „vor"/„auf" nur als abgetrennte Vorsilbe am
      // Satzende („kommt … vor?"), nicht als Präposition („steht vor Gericht").
      'wie\\s+oft\\s+(?:wird|kommt|taucht|steht)\\s+[^.?!]{0,80}?(?<![\\wäöüß])(?:erw(?:ä|ae)hnt|genannt|verwendet|(?:vor|auf)(?=\\s*(?:[.?!]|$)))',
      'wie\\s+viele\\s+(?:w(?:ö|oe)rter|seiten|quellen|dokumente|treffer)',
      'seite\\s+\\d+',
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
