/**
 * Chat messages for the Grünerator Chat API
 * Professional but friendly tone, like a helpful work colleague
 */

export const CHAT_MESSAGES = {
  // Single result messages with variations
  SINGLE_RESULT: {
    dreizeilen: [
      "Dein Dreizeilen-Sharepic ist bereit:",
      "Hier ist dein Dreizeilen-Format:",
      "Das Dreizeilen-Sharepic ist fertig ✓",
      "Deine drei Zeilen sind erstellt:"
    ],
    headline: [
      "Deine Schlagzeile ist fertig:",
      "Hier ist die Headline:",
      "Die Schlagzeile steht ✓",
      "Deine Headline ist bereit:"
    ],
    info: [
      "Die Infografik ist erstellt:",
      "Hier ist dein Infotext:",
      "Der strukturierte Info-Content:",
      "Deine Infografik ist fertig 📊"
    ],
    zitat: [
      "Das Zitat ist bereit:",
      "Hier ist dein Zitat:",
      "Das passende Zitat für dich:",
      "Dein Zitat ist erstellt 💬"
    ],
    quote: [
      "Das Zitat ist bereit:",
      "Hier ist dein Zitat:",
      "Das passende Zitat für dich:",
      "Dein Zitat ist erstellt 💬"
    ],
    social_media: [
      "Dein Social Media Post ist fertig:",
      "Der Post für die sozialen Medien:",
      "Hier ist dein Social Media Content:",
      "Der Post ist bereit 📱"
    ],
    pressemitteilung: [
      "Die Pressemitteilung ist fertig:",
      "Hier ist deine Pressemitteilung:",
      "Die PM ist erstellt 📰",
      "Deine Pressemitteilung steht:"
    ],
    antrag: [
      "Der Antrag ist formuliert:",
      "Hier ist dein Antrag:",
      "Dein Antrag ist fertig ✓",
      "Der strukturierte Antrag:"
    ],
    universal: [
      "Der Text ist fertig:",
      "Hier ist dein Content:",
      "Dein Text ist erstellt ✓",
      "Das Ergebnis steht:"
    ]
  },

  // Multi-result messages with variations
  MULTI_RESULT: [
    "Ich habe {count} {resultWord} für dich erstellt:",
    "Hier sind deine {count} {resultWord}:",
    "Fertig! {count} {resultWord} sind bereit ✓",
    "Alles erledigt - {count} {resultWord}:"
  ],

  // Edit success messages
  EDIT_SUCCESS: [
    "Erledigt! {count} {changeWord} angewendet ✓",
    "Die {count} {changeWord} sind umgesetzt:",
    "{count} {changeWord} erfolgreich angewendet.",
    "Fertig - {count} {changeWord} sind drin ✓"
  ],

  // Error messages (professional but helpful)
  ERRORS: {
    empty_message: "Bitte gib mir eine Nachricht ein.",
    empty_instruction: "Ich benötige eine Anweisung zum Bearbeiten.",
    no_text_to_edit: "Es ist noch kein Text zum Bearbeiten vorhanden. Lass mich zuerst einen erstellen.",
    unexpected_response: "Es gab ein Problem mit der Antwort. Bitte versuche es erneut.",
    no_agent: "Der Antwort-Typ konnte nicht identifiziert werden.",
    no_content: "Es wurde kein Textinhalt zurückgegeben. Bitte versuche es nochmal.",
    all_failed: "Alle Versuche sind fehlgeschlagen. Bitte probiere eine andere Formulierung.",
    general_error: "Es ist ein Fehler aufgetreten: {error}"
  },

  // No changes message
  NO_CHANGES: [
    "Ich sehe keine konkreten Änderungen. Kannst du spezifischer werden?",
    "Bitte beschreibe genauer, was geändert werden soll.",
    "Welche Anpassungen stellst du dir vor?",
    "Konkretisiere gerne deine Änderungswünsche."
  ]
};

/**
 * Get a random message from an array
 * @param {Array} messages - Array of message templates
 * @returns {string} Random message
 */
export const getRandomMessage = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }
  return messages[Math.floor(Math.random() * messages.length)];
};

/**
 * Get a contextual message for single results
 * @param {string} agent - The agent type
 * @param {string} title - Fallback title
 * @returns {string} Contextual message
 */
export const getSingleResultMessage = (agent, title) => {
  const messages = CHAT_MESSAGES.SINGLE_RESULT[agent];
  if (messages) {
    return getRandomMessage(messages);
  }
  return `Neuer ${title} erstellt! ✨`;
};

/**
 * Get a multi-result message
 * @param {number} count - Number of results
 * @returns {string} Multi-result message
 */
export const getMultiResultMessage = (count) => {
  const resultWord = count === 1 ? 'Vorschlag' : 'Vorschläge';
  const template = getRandomMessage(CHAT_MESSAGES.MULTI_RESULT);
  return template
    .replace('{count}', count)
    .replace('{resultWord}', resultWord);
};

/**
 * Get an edit success message
 * @param {number} changeCount - Number of changes made
 * @returns {string} Edit success message
 */
export const getEditSuccessMessage = (changeCount) => {
  const changeWord = changeCount === 1 ? 'Änderung' : 'Änderungen';
  const template = getRandomMessage(CHAT_MESSAGES.EDIT_SUCCESS);
  return template
    .replace('{count}', changeCount)
    .replace('{changeWord}', changeWord);
};

/**
 * Get an error message
 * @param {string} errorType - Type of error
 * @param {string} errorDetails - Additional error details
 * @returns {string} Error message
 */
export const getErrorMessage = (errorType, errorDetails = '') => {
  const message = CHAT_MESSAGES.ERRORS[errorType];
  if (message) {
    return message.replace('{error}', errorDetails);
  }
  return CHAT_MESSAGES.ERRORS.general_error.replace('{error}', errorDetails || 'Unbekannter Fehler');
};

/**
 * Get a "no changes" message
 * @returns {string} No changes message
 */
export const getNoChangesMessage = () => {
  return getRandomMessage(CHAT_MESSAGES.NO_CHANGES);
};