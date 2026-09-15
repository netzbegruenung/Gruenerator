/**
 * Die Vokabular-Tore der Agentura-Werkzeuge: „Redet dieser Turn über
 * wiederkehrende Aufgaben?" entscheidet, ob `recurring_tasks` im
 * Werkzeugkatalog dieses Turns steht; „… über eigene Grünerator-Agenten?"
 * dasselbe für `user_agents`, „… über Rezepte und eigene Textformen?" für
 * `recipes` (beide unten).
 *
 * Ein reines Vokabular-Tor, anders als bei `cloud_files` ohne Zähler: wer eine
 * Aufgabe hat, redet über sie, wenn er sie meint — „pausier die Erinnerung",
 * „welche Aufgaben laufen bei mir" —, und ein Konto ohne Aufgabe erreicht das
 * Werkzeug über den Bestell-Detektor (`looksLikeRecurringOrder`, der am Mount
 * daneben steht). Der Katalog kostet Tokens; was hier trifft, zahlt dafür.
 *
 * „Aufgabe" allein zählt NICHT: das Wort gehört auch den Board-Karten
 * (`boards_tasks`), und „Aufgabe auf dem Board" darf dieses Werkzeug nicht
 * montieren. Es zählt nur mit einem Takt- oder Automatik-Attribut davor oder
 * einem Verwaltungsverb dahinter.
 *
 * `\b` ist neben Umlauten tot (`\bwöchentlich` scheitert), deshalb Lookarounds
 * — dasselbe Idiom wie `CLOUD_VOCABULARY`.
 */

const RECURRING_VOCABULARY = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [
      'wiederkehrend\\w*',
      'regelm[äa][ßs]ig\\w*',
      'dauerauftr[äa]g\\w*',
      'erinnerung(?:en)?',
      'zeitpl[äa]n\\w*',
      'pausier\\w*',
      'fortsetz\\w*',
      'fortf[üu]hr\\w*',
      // Aufgabe nur mit Takt-/Automatik-Attribut …
      '(?:t[äa]gliche|w[öo]chentliche|monatliche|geplante|automatische|automatisierte)\\w*\\s+aufgaben?',
      // … oder mit Verwaltungsverb dahinter.
      'aufgaben?\\s+(?:pausieren|fortsetzen|anhalten|stoppen|löschen|jetzt\\s+ausführen|sofort\\s+ausführen)',
      'jede[nrs]?\\s+(?:tag|woche|monat|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)',
    ].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function mentionsRecurringTasks(text: string | null | undefined): boolean {
  if (!text) return false;
  return RECURRING_VOCABULARY.test(text);
}

/**
 * „Redet dieser Turn über eigene Grünerator-Agenten?" — das Tor für
 * `user_agents`. Der zweite Weg ins Werkzeug ist kein Vokabular, sondern der
 * Thread selbst: läuft er mit einem User-Agent (`agentConfig.isUserAgent`),
 * steht das Werkzeug immer, damit „ändere deine Rolle" ohne Stichwort trifft.
 *
 * „Agent" allein zählt NICHT: das Wort steht auch in Nachrichten („Agenten des
 * BND") und in „Agentur"/„Agenda". Es zählt nur als Produktwort
 * (Grünerator-Agent, Agentura, Persona, Systemrolle), mit Besitz- oder
 * Zählartikel davor („meinen Agenten", „einen Agenten") oder mit einem
 * Verwaltungsverb dahinter („Agenten anlegen/teilen/löschen"). Der Genderstern
 * (Agent*in) ist eine eigene Schreibung und muss mitgelesen werden.
 */
const AGENT_WORD = 'agent(?:\\*innen|\\*in|en|innen|in)?';

const USER_AGENT_VOCABULARY = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [
      'gr[üu]nerator-agent\\w*',
      'agentura',
      'persona',
      'system-?rolle\\w*',
      'system-?prompt\\w*',
      `(?:mein|meine|meinen|meiner|eigene[nr]?|neue[nr]?|einen|welche|alle)\\s+(?:ki-)?${AGENT_WORD}`,
      `${AGENT_WORD}\\s+(?:anlegen|bauen|erstellen|einrichten|ändern|anpassen|umbenennen|bearbeiten|teilen|löschen|konfigurieren)`,
      // Verb voran, Artikel dazwischen: „teil den Agenten", „lösch mir den Agenten".
      `(?:teil\\w*|l[öo]sch\\w*|bau\\w*|leg\\w*|erstell\\w*|richte\\w*|[äa]nder\\w*)\\s+(?:mir\\s+|bitte\\s+)?(?:den|einen|meinen|deinen)\\s+(?:ki-)?${AGENT_WORD}`,
    ].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function mentionsUserAgents(text: string | null | undefined): boolean {
  if (!text) return false;
  return USER_AGENT_VOCABULARY.test(text);
}

/**
 * „Redet dieser Turn über Rezepte oder eigene Textformen?" — das Tor für
 * `recipes`. Anders als bei `user_agents` gibt es keinen zweiten Weg über den
 * Thread: ein aktives Rezept (`activeSkillMention`) heißt „anwenden", und das
 * macht `rezept_laden`; verwalten will, wer es sagt.
 *
 * „Stil" allein zählt NICHT („im Stil der Grünen", „im Stil von Habeck" —
 * Schreibaufträge, keine Verwaltung). Es zählt als Produktwort (Rezept,
 * Textform, Schreibstil, Texte anlernen) oder als Lernauftrag: „lern meinen
 * Stil", „Beispiele einlesen", „so schreibe ich". Die Lookarounds halten
 * „Rezeptfrei" und „Rezeption" draußen; „Kochrezept" scheitert schon am
 * Lookbehind, ein nacktes „Rezept für Kürbissuppe" trifft und ist der
 * hingenommene Fehlalarm.
 */
const RECIPE_VOCABULARY = new RegExp(
  [
    '(?<![\\wäöüß])(?:',
    [
      'rezept(?:e|es|en)?',
      'textform(?:en)?',
      'schreibstil\\w*',
      'texte?\\s+anlernen',
      'angelernt\\w*',
      // Lernauftrag: „lern meinen Stil", „speicher unseren Stil", „meinen Stil lernen".
      '(?:lern\\w*|speicher\\w*|merk\\w*)\\s+(?:(?:dir|mir|bitte)\\s+){0,2}(?:meinen|unseren|den)\\s+(?:schreib)?stil',
      '(?:meinen|unseren|den)\\s+(?:schreib)?stil\\s+(?:lernen|speichern|anlernen|merken|übernehmen)',
      // „Beispiele lernen/einlesen", „aus diesen Beispielen lernen".
      'beispiele?\\s+(?:lernen|einlesen|anlernen)',
      '(?:aus|von)\\s+(?:diesen|den|meinen|unseren)\\s+beispielen\\s+(?:lernen|einlesen)',
      'so\\s+schreib(?:e|en)\\s+(?:ich|wir)',
    ].join('|'),
    ')(?![\\wäöüß])',
  ].join(''),
  'i'
);

export function mentionsRecipes(text: string | null | undefined): boolean {
  if (!text) return false;
  return RECIPE_VOCABULARY.test(text);
}
