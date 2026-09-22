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
 * „Entfernung" sind Nomen, die wie die Verben anfangen; die Verbformen stehen
 * deshalb mit fester Endung statt mit `\w*`.
 *
 * `\b` ist neben Umlauten tot (`\bzähl` scheitert), deshalb Lookarounds —
 * dasselbe Idiom wie `agenturaContext.ts`.
 */

const NOTEBOOK_TOOL_ASK = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [
      // ── Verben ──
      'sortier(?:e|en|t|st)?',
      'ordne(?:n|t)?',
      'reih(?:e|en|t)?\\s+(?:mir\\s+)?(?:die|alle|sie)',
      'z(?:ä|ae)hl(?:e|en|t|st)?',
      'liste?\\s+(?:mir\\s+)?(?:alle|die)',
      'lies',
      '(?:ö|oe)ffne(?:n)?',
      'zeig\\w*\\s+(?:mir\\s+)?(?:die\\s+)?(?:seiten?|quellen?|stellen?|gliederung|inhaltsverzeichnis)',
      'beleg(?:e)?\\s+(?:mir\\s+|bitte\\s+)?(?:das|dies\\w*|die|es|mit)',
      'zitier(?:e|en|t)?',
      'finde?\\s+(?:mir\\s+)?(?:die\\s+)?(?:stelle|passage|textstelle|das\\s+zitat)',
      'umbenenn\\w*',
      'entfern(?:e|en|t)?',
      'verschieb(?:e|en|t)?',
      'kopier(?:e|en|t)?',
      'notier(?:e|en|t)?',
      'tagg(?:e|en|t)?',
      // ── Orte und Mengen ──
      // „wie oft" nur als Zählauftrag — „wie oft tagt der Vorstand" ist eine
      // Inhaltsfrage.
      'wie\\s+oft\\s+(?:kommt|taucht|wird|steht|f(?:ä|ae)llt|erscheint)',
      'wie\\s+viele\\s+(?:w(?:ö|oe)rter|seiten|quellen|dokumente|treffer)',
      'seite\\s+\\d+',
      'abschnitt\\s+\\d+',
      'kapitel\\s+\\d+',
      'w(?:ö|oe)rtlich',
      '(?:nach|sortiert\\s+nach)\\s+(?:datum|name|l(?:ä|ae)nge|seiten|relevanz)',
      '(?:quellen?|dokumente?)\\s+(?:ist|sind)\\s+(?:die|das|am)\\s+(?:l(?:ä|ae)ngst|k(?:ü|ue)rzest|neuest|(?:ä|ae)ltest)\\w*',
    ].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function looksLikeNotebookToolAsk(text: string | null | undefined): boolean {
  if (!text) return false;
  return NOTEBOOK_TOOL_ASK.test(text);
}
