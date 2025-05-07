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
 * Combines a base prompt with additional knowledge content.
 * @param {string | null} basePrompt The user's custom prompt.
 * @param {string | null} knowledgeString The formatted string of selected knowledge items.
 * @returns {string | null} The combined prompt string, or null if both inputs are empty.
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