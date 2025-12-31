/**
 * Natural, human-like message variants for the assistant
 * Keeps responses feeling fresh and personal
 */

// Articles for German grammar (ein/eine/einen)
const AGENT_ARTICLES = {
  zitat_pure: 'ein',
  zitat: 'ein',
  zitat_with_image: 'ein',
  dreizeilen: 'ein',
  headline: 'eine',
  info: 'ein',
  social_media: 'einen',
  pressemitteilung: 'eine',
  antrag: 'einen',
  universal: 'einen'
};

// Human-friendly names
const AGENT_NAMES = {
  zitat_pure: 'Zitat-Sharepic',
  zitat: 'Zitat-Sharepic',
  zitat_with_image: 'Zitat mit Bild',
  dreizeilen: 'Dreizeilen-Sharepic',
  headline: 'Headline-Sharepic',
  info: 'Info-Sharepic',
  social_media: 'Social-Media-Post',
  pressemitteilung: 'Pressemitteilung',
  antrag: 'Antrag',
  universal: 'Text'
};

// Message templates - {items} will be replaced with the formatted list
const MULTI_RESULT_TEMPLATES = [
  // Simple & friendly
  "Ich hab dir {items} erstellt.",
  "Hier sind {items} für dich.",
  "Fertig! {items}.",
  "{items} – bitte sehr!",
  "Das hab ich draus gemacht: {items}.",

  // With soft endings
  "Ich hab dir {items} vorbereitet. Schau mal drüber!",
  "{items} sind fertig. Sag Bescheid wenn was nicht passt.",
  "So, {items} sind da!",
  "Hier kommt {items}.",

  // Casual & warm
  "Tada! {items} für dich.",
  "Hab dir {items} gebastelt.",
  "{items} – frisch aus dem Grünerator!",
  "Bitteschön: {items}.",

  // Slightly more formal but still warm
  "Ich habe {items} für dich erstellt.",
  "Hier sind {items}. Viel Erfolg damit!",
  "{items} sind jetzt bereit.",

  // With questions/offers
  "{items} – passt das so?",
  "Hier {items}. Soll ich noch was anpassen?",
  "{items}. Brauchst du noch was?",

  // Short & punchy
  "Done! {items}.",
  "Fertig: {items}.",
  "Check: {items}.",
  "Erledigt – {items}."
];

// Connectors for lists (replaces "und" sometimes)
const LIST_CONNECTORS = [
  'und',
  'und',  // weighted more common
  'und',
  'plus',
  'sowie',
  'und dazu'
];

/**
 * Get article for an agent type
 */
export const getAgentArticle = (agent) => AGENT_ARTICLES[agent] || 'ein';

/**
 * Get human-friendly name for an agent
 */
export const getAgentName = (agent) => AGENT_NAMES[agent] || agent;

/**
 * Format a label with article (e.g., "ein Zitat-Sharepic")
 */
export const formatAgentWithArticle = (agent) => {
  return `${getAgentArticle(agent)} ${getAgentName(agent)}`;
};

/**
 * Join items naturally in German
 * ["A", "B", "C"] -> "A, B und C"
 */
const joinItemsNaturally = (items) => {
  if (items.length === 1) return items[0];
  if (items.length === 2) {
    const connector = LIST_CONNECTORS[Math.floor(Math.random() * LIST_CONNECTORS.length)];
    return `${items[0]} ${connector} ${items[1]}`;
  }

  const connector = LIST_CONNECTORS[Math.floor(Math.random() * LIST_CONNECTORS.length)];
  const allButLast = items.slice(0, -1).join(', ');
  return `${allButLast} ${connector} ${items[items.length - 1]}`;
};

/**
 * Generate a natural, human-like message for multi-result responses
 * @param {Array} responses - Array of response objects with agent and content
 * @returns {string} Natural message
 */
export const generateMultiResultMessage = (responses) => {
  // Build labels from responses
  const labels = responses.map((response) => {
    // Prefer title if available
    const title = response.content?.title || response.content?.metadata?.title;
    if (title) {
      // If we have a title, use it with context
      const agentName = getAgentName(response.agent);
      // Check if title is different from agent name
      if (title.toLowerCase() !== agentName.toLowerCase()) {
        return `${getAgentArticle(response.agent)} ${agentName} "${title}"`;
      }
      return formatAgentWithArticle(response.agent);
    }
    return formatAgentWithArticle(response.agent);
  });

  // Join items naturally
  const itemsString = joinItemsNaturally(labels);

  // Pick random template
  const template = MULTI_RESULT_TEMPLATES[Math.floor(Math.random() * MULTI_RESULT_TEMPLATES.length)];

  return template.replace('{items}', itemsString);
};

/**
 * Get a random greeting for conversation start
 */
export const getRandomGreeting = () => {
  const greetings = [
    "Was kann ich für dich tun?",
    "Wie kann ich helfen?",
    "Was brauchst du?",
    "Was soll ich erstellen?"
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
};
