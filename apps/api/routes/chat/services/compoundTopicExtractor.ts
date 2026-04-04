/**
 * Compound Topic Extractor
 *
 * Extracts a search topic from compound queries where mentions have been stripped.
 * Handles vague queries like "@hamburg @presse" where clean text may be nearly empty
 * after mention removal.
 */

const NOTEBOOK_DISPLAY_NAMES: Record<string, string> = {
  'gruenerator-notebook': 'Grüne Programme',
  'gruene-notebook': 'Grundsatzprogramm',
  'bundestagsfraktion-notebook': 'Bundestagsfraktion',
  'hamburg-notebook': 'Hamburg',
  'schleswig-holstein-notebook': 'Schleswig-Holstein',
  'thueringen-notebook': 'Thüringen',
  'oesterreich-notebook': 'Österreich',
  'bayern-notebook': 'Bayern',
  'berlin-notebook': 'Berlin',
  'mecklenburg-vorpommern-notebook': 'Mecklenburg-Vorpommern',
  'brandenburg-notebook': 'Brandenburg',
  'kommunalwiki-notebook': 'Kommunalwiki',
  'boell-stiftung-notebook': 'Böll-Stiftung',
  'gruenblog-notebook': 'Grüner Blog',
};

const STOP_WORDS = new Set([
  // Action verbs (all conjugations)
  'erstelle',
  'erstell',
  'erstellen',
  'schreibe',
  'schreib',
  'schreiben',
  'verfasse',
  'verfass',
  'verfassen',
  'formuliere',
  'formulier',
  'formulieren',
  'generiere',
  'generier',
  'generieren',
  'mache',
  'mach',
  'machen',
  'bereite',
  'entwirf',
  'entwerfe',
  'visualisiere',
  'visualisier',
  // Filler words
  'mir',
  'bitte',
  'mal',
  'doch',
  'ein',
  'eine',
  'einen',
  'einer',
  'einem',
  'eines',
  'die',
  'der',
  'den',
  'das',
  'dem',
  'des',
  'kurze',
  'kurzen',
  'kurzer',
  'lange',
  'langen',
  'langer',
  'ausführliche',
  'ausführlichen',
  'ausführlicher',
  // Content type nouns
  'pressemitteilung',
  'pressemeldung',
  'pm',
  'artikel',
  'beitrag',
  'blogpost',
  'rede',
  'ansprache',
  'statement',
  'antrag',
  'anfrage',
  'argumentation',
  'bericht',
  'analyse',
  'post',
  'tweet',
  'wahlprogramm',
  // Prepositions
  'über',
  'ueber',
  'zum',
  'zur',
  'zu',
  'bezüglich',
  'betreffend',
  'thema',
]);

/**
 * Extract a search topic from potentially vague compound query text.
 *
 * Filters out German action verbs, filler words, content type nouns, and prepositions
 * to isolate the factual topic. Falls back to notebook display names if the
 * remaining text is too short.
 */
export function extractCompoundTopic(cleanText: string, notebookIds: string[]): string {
  const words = cleanText.split(/\s+/).filter(Boolean);
  const topicWords = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const topic = topicWords.join(' ').trim();

  if (topic.length >= 5) {
    return topic;
  }

  const notebookNames = notebookIds.map((id) => NOTEBOOK_DISPLAY_NAMES[id]).filter(Boolean);

  if (notebookNames.length > 0) {
    return notebookNames.join(', ') + (topic ? ` ${topic}` : '');
  }

  return topic || 'aktuelle Themen';
}
