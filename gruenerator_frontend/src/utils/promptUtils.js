import DOMPurify from 'dompurify';
import apiClient from '../components/utils/apiClient';

// Function to safely render Markdown to HTML using backend service
export const renderMarkdown = async (markdown) => {
  if (!markdown) return { __html: '' };
  
  try {
    // Use backend API for markdown conversion
    const response = await apiClient.post('/markdown/to-html', { content: markdown });
    
    if (response.data.success) {
      const cleanMarkup = DOMPurify.sanitize(response.data.html);
      return { __html: cleanMarkup };
    } else {
      console.error('Backend markdown conversion failed:', response.data.message);
      // Fallback to original content
      return { __html: DOMPurify.sanitize(markdown) };
    }
  } catch (error) {
    console.error('Error calling backend markdown service:', error);
    // Fallback to original content on error
    return { __html: DOMPurify.sanitize(markdown) };
  }
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
 * Creates a structured final prompt with instructions, knowledge, memories, documents, and additional context.
 * @param {string | null} customInstructions User's custom instructions/prompt.
 * @param {string | null} knowledgeContent The formatted string of selected knowledge items.
 * @param {string | null} memoryContent The formatted string of relevant memories from mem0.
 * @param {string | null} basePrompt Additional base prompt/context.
 * @param {string | null} documentContent The formatted string of relevant document excerpts (from API search).
 * @param {string | null} selectedDocumentContent The formatted string of user-selected documents.
 * @returns {string | null} The structured prompt string, or null if all inputs are empty.
 */
export const createPromptWithMemories = (customInstructions, knowledgeContent, memoryContent, basePrompt = null, documentContent = null, selectedDocumentContent = null) => {
  const instructionsPart = customInstructions?.trim() || '';
  const knowledgePart = knowledgeContent?.trim() || '';
  const memoryPart = memoryContent?.trim() || '';
  const basePart = basePrompt?.trim() || '';
  const documentPart = documentContent?.trim() || '';
  const selectedDocumentPart = selectedDocumentContent?.trim() || '';
  
  // Return null if all inputs are empty
  if (!instructionsPart && !knowledgePart && !memoryPart && !basePart && !documentPart && !selectedDocumentPart) {
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
  
  // Add memories with clear header
  if (memoryPart) {
    parts.push(`Aus früheren Interaktionen mit dem User sind folgende relevante Informationen bekannt:\n${memoryPart}`);
  }
  
  // Add API-searched documents with clear header
  if (documentPart) {
    parts.push(`Der User hat folgende relevante Dokumente hochgeladen:\n${documentPart}`);
  }
  
  // Add user-selected documents with clear header
  if (selectedDocumentPart) {
    parts.push(`Der User hat explizit folgende Dokumente für diese Anfrage ausgewählt:\n${selectedDocumentPart}`);
  }
  
  // Add base prompt as additional context if provided
  if (basePart) {
    parts.push(`Zusätzlicher Kontext:\n${basePart}`);
  }
  
  return parts.join('\n\n---\n\n');
};

/**
 * Creates a base prompt from form data for social media generators
 * @param {Object} formData - Form data object
 * @returns {string} Formatted base prompt
 */
export const createBasePromptFromFormData = (formData) => {
  const { thema, details, platforms = [], zitatgeber, pressekontakt } = formData;
  
  let basePrompt = `Thema: ${thema || 'Nicht angegeben'}`;
  
  if (details) {
    basePrompt += `\nDetails: ${details}`;
  }
  
  if (platforms.length > 0) {
    basePrompt += `\nFormate: ${platforms.join(', ')}`;
  }
  
  if (platforms.includes('pressemitteilung')) {
    if (zitatgeber) {
      basePrompt += `\nZitat von: ${zitatgeber}`;
    }
    if (pressekontakt) {
      basePrompt += `\nPressekontakt: ${pressekontakt}`;
    }
  }
  
  return basePrompt;
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