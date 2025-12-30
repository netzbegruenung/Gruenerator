/**
 * Question Emoji Mapper
 * Maps question types and answers to appropriate emojis for a more playful UX
 */

/**
 * Get emoji for a question based on its type/category
 * @param {string} questionType - The type/category of the question
 * @returns {string} Emoji character
 */
export function getQuestionEmoji(questionType) {
  const emojiMap = {
    // Core categories
    scope: '🎯',           // Target/focus
    audience: '🏛️',       // Government building
    committee: '🏛️',      // Government building
    tone: '🎨',            // Palette/tone
    structure: '📋',       // Clipboard/organization
    facts: '📊',           // Chart/data

    // Action/implementation categories
    measures: '⚙️',        // Gear/action
    stakeholders: '👥',    // People
    timeline: '⏱️',        // Timer/schedule
    justification: '💡',   // Lightbulb/reason
    goals: '🎯',           // Target
    budget: '💰',          // Money
    legal_basis: '⚖️',     // Scales/law

    // Other categories
    clarification: '🔍',   // Magnifying glass
    priority: '⭐',        // Star/priority
    background: '📖',      // Book/context
    info_goal: '🔎',       // Search/information
    format: '📄',          // Document
    main_topic: '📌',      // Pin/main focus
    debate_focus: '💬',    // Speech bubble
    data_focus: '📈',      // Trending chart
    sub_questions: '🔢',   // Numbers
    political_context: '🗳️', // Ballot box
    specificity: '🎲'      // Dice/specificity
  };

  return emojiMap[questionType] || '❓'; // Default question mark
}

/**
 * Get emoji for yes/no answers
 * @param {string} answer - The answer text ("Ja" or "Nein")
 * @returns {string} Emoji character
 */
export function getYesNoEmoji(answer) {
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer.startsWith('ja')) {
    return '✅';
  }
  if (normalizedAnswer.startsWith('nein')) {
    return '❌';
  }

  return '';
}

/**
 * Get contextual emoji for answer options based on question type
 * @param {string} questionType - The type/category of the question
 * @param {string} optionText - The text of the answer option
 * @returns {string} Emoji character or empty string
 */
export function getAnswerOptionEmoji(questionType, optionText) {
  if (!optionText) return '';

  const lowerOption = optionText.toLowerCase();

  // Timeline-specific emojis
  if (questionType === 'timeline') {
    if (lowerOption.includes('monat')) return '📅';
    if (lowerOption.includes('jahr')) return '📆';
    if (lowerOption.includes('sofort')) return '⚡';
  }

  // Measures-specific emojis
  if (questionType === 'measures') {
    if (lowerOption.includes('prüf')) return '🔍';
    if (lowerOption.includes('umsetz')) return '🚀';
    if (lowerOption.includes('pilot')) return '🧪';
    if (lowerOption.includes('konzept')) return '📝';
  }

  // Stakeholders-specific emojis
  if (questionType === 'stakeholders') {
    if (lowerOption.includes('verwaltung')) return '🏢';
    if (lowerOption.includes('bürger')) return '👨‍👩‍👧‍👦';
    if (lowerOption.includes('expert')) return '👔';
    if (lowerOption.includes('verein')) return '🤝';
  }

  // Budget-specific emojis
  if (questionType === 'budget') {
    if (lowerOption.includes('kosten')) return '💶';
    if (lowerOption.includes('budget')) return '💰';
  }

  // Tone-specific emojis
  if (questionType === 'tone') {
    if (lowerOption.includes('sachlich')) return '📋';
    if (lowerOption.includes('appellativ')) return '📣';
    if (lowerOption.includes('konstruktiv')) return '🤝';
    if (lowerOption.includes('kritisch')) return '⚠️';
  }

  return '';
}

/**
 * Get emoji for question round indicator
 * @param {number} round - The round number
 * @returns {string} Emoji character
 */
export function getRoundEmoji(round) {
  const roundEmojis = {
    1: '1️⃣',
    2: '2️⃣',
    3: '3️⃣'
  };

  return roundEmojis[round] || '🔄';
}

/**
 * Progress completion emoji
 * @param {number} percentage - Completion percentage (0-100)
 * @returns {string} Emoji character
 */
export function getProgressEmoji(percentage) {
  if (percentage === 100) return '✅';
  if (percentage >= 75) return '🟢';
  if (percentage >= 50) return '🟡';
  if (percentage >= 25) return '🟠';
  return '⚪';
}
