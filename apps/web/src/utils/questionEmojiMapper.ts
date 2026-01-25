/**
 * Question Emoji Mapper
 * Maps question types and answers to appropriate emojis for a more playful UX
 */

type QuestionType =
  | 'scope'
  | 'audience'
  | 'committee'
  | 'tone'
  | 'structure'
  | 'facts'
  | 'measures'
  | 'stakeholders'
  | 'timeline'
  | 'justification'
  | 'goals'
  | 'budget'
  | 'legal_basis'
  | 'clarification'
  | 'priority'
  | 'background'
  | 'info_goal'
  | 'format'
  | 'main_topic'
  | 'debate_focus'
  | 'data_focus'
  | 'sub_questions'
  | 'political_context'
  | 'specificity';

/**
 * Get emoji for a question based on its type/category
 * @param questionType - The type/category of the question
 * @returns Emoji character
 */
export function getQuestionEmoji(questionType: string): string {
  const emojiMap: Record<string, string> = {
    // Core categories
    scope: '🎯', // Target/focus
    audience: '🏛️', // Government building
    committee: '🏛️', // Government building
    tone: '🎨', // Palette/tone
    structure: '📋', // Clipboard/organization
    facts: '📊', // Chart/data

    // Action/implementation categories
    measures: '⚙️', // Gear/action
    stakeholders: '👥', // People
    timeline: '⏱️', // Timer/schedule
    justification: '💡', // Lightbulb/reason
    goals: '🎯', // Target
    budget: '💰', // Money
    legal_basis: '⚖️', // Scales/law

    // Other categories
    clarification: '🔍', // Magnifying glass
    priority: '⭐', // Star/priority
    background: '📖', // Book/context
    info_goal: '🔎', // Search/information
    format: '📄', // Document
    main_topic: '📌', // Pin/main focus
    debate_focus: '💬', // Speech bubble
    data_focus: '📈', // Trending chart
    sub_questions: '🔢', // Numbers
    political_context: '🗳️', // Ballot box
    specificity: '🎲', // Dice/specificity
  };

  return emojiMap[questionType] || '❓'; // Default question mark
}

/**
 * Get emoji for yes/no answers
 * @param answer - The answer text ("Ja" or "Nein")
 * @returns Emoji character
 */
export function getYesNoEmoji(answer: string): string {
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
 * @param questionType - The type/category of the question
 * @param optionText - The text of the answer option
 * @returns Emoji character or empty string
 */
export function getAnswerOptionEmoji(
  questionType: string,
  optionText: string | null | undefined
): string {
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
 * @param round - The round number
 * @returns Emoji character
 */
export function getRoundEmoji(round: number): string {
  const roundEmojis: Record<number, string> = {
    1: '1️⃣',
    2: '2️⃣',
    3: '3️⃣',
  };

  return roundEmojis[round] || '🔄';
}

/**
 * Progress completion emoji
 * @param percentage - Completion percentage (0-100)
 * @returns Emoji character
 */
export function getProgressEmoji(percentage: number): string {
  if (percentage === 100) return '✅';
  if (percentage >= 75) return '🟢';
  if (percentage >= 50) return '🟡';
  if (percentage >= 25) return '🟠';
  return '⚪';
}
