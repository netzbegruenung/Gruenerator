import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Function to safely render Markdown to HTML
export const renderMarkdown = (markdown) => {
  if (!markdown) return { __html: '' };
  // Configure marked to add breaks on newlines
  marked.setOptions({
    breaks: true, // Add <br> on single newlines
    gfm: true // Use GitHub Flavored Markdown
  });
  const rawMarkup = marked.parse(markdown);
  const cleanMarkup = DOMPurify.sanitize(rawMarkup);
  return { __html: cleanMarkup };
};

/**
 * Creates a structured final prompt with clear separation of instructions and knowledge.
 * @param {string | null} customInstructions User's custom instructions/prompt.
 * @param {string | null} knowledgeContent The formatted string of selected knowledge items.
 * @param {string | null} basePrompt Additional base prompt/context.
 * @returns {string | null} The structured prompt string, or null if all inputs are empty.
 */
export const createStructuredFinalPrompt = (customInstructions, knowledgeContent, basePrompt = null) => {
  const instructionsPart = customInstructions?.trim() || '';
  const knowledgePart = knowledgeContent?.trim() || '';
  const basePart = basePrompt?.trim() || '';
  
  // Return null if all inputs are empty
  if (!instructionsPart && !knowledgePart && !basePart) {
    return null;
  }
  
  let parts = [];
  
  // Add instructions with clear header
  if (instructionsPart) {
    parts.push(`Der User gibt dir folgende Anweisungen, die du explizit befolgen sollst:\n${instructionsPart}`);
  }
  
  // Add knowledge with clear header
  if (knowledgePart) {
    parts.push(`Der User stellt dir folgendes, wichtiges Wissen zur Verfügung:\n${knowledgePart}`);
  }
  
  // Add base prompt as additional context if provided
  if (basePart) {
    parts.push(`Zusätzlicher Kontext:\n${basePart}`);
  }
  
  return parts.join('\n\n---\n\n');
};

/**
 * Combines a base prompt with additional knowledge content.
 * @param {string | null} basePrompt The user's custom prompt.
 * @param {string | null} knowledgeString The formatted string of selected knowledge items.
 * @returns {string | null} The combined prompt string, or null if both inputs are empty.
 * @deprecated Use createStructuredFinalPrompt for better structure
 */
export const createFinalPrompt = (basePrompt, knowledgeString) => {
  const promptPart = basePrompt?.trim() || '';
  const knowledgePart = knowledgeString?.trim() || '';

  if (!promptPart && !knowledgePart) {
    return null; // Return null if both are empty
  }
  if (!promptPart) {
    // Use a clear header if only knowledge exists
    return `Zusätzliches Wissen zur Berücksichtigung:
${knowledgePart}`;
  }
  if (!knowledgePart) {
    return promptPart; // Return only the prompt if no knowledge
  }

  // Combine both with a separator and header for clarity
  return `${promptPart}

---
Zusätzliches Wissen zur Berücksichtigung:
${knowledgePart}`;
};

// Add other prompt-related utilities here if needed 