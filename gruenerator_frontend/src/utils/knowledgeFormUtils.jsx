import React from 'react';
import { HiInformationCircle } from 'react-icons/hi';
import { createPromptWithMemories } from './promptUtils';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

/**
 * Search documents for relevant content based on query
 * @param {string} query - Search query
 * @param {string} userId - User ID for document access
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of relevant documents
 */
export const getDocuments = async (query, userId, limit = 3) => {
  if (!query?.trim() || !userId) {
    return [];
  }

  try {
    console.log('[getDocuments] Searching documents for:', { query, userId, limit });
    
    const response = await fetch(`${AUTH_BASE_URL}/api/documents/search`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query.trim(),
        limit: limit
      }),
    });

    if (!response.ok) {
      console.warn('[getDocuments] Search failed:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('[getDocuments] Search response:', data);

    if (!data.success || !Array.isArray(data.data)) {
      console.warn('[getDocuments] No results found');
      return [];
    }

    console.log(`[getDocuments] Returning ${data.data.length} relevant documents`);
    return data.data;

  } catch (error) {
    console.warn('[getDocuments] Error searching documents:', error.message);
    return []; // Fail silently - document search shouldn't block generation
  }
};

/**
 * Formats document search results into a structured string for prompt integration
 * @param {Array} documents - Array of document objects from search
 * @returns {string|null} Formatted document string or null if no documents
 */
export const formatDocuments = (documents) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    return null;
  }

  const formattedDocs = documents.map((doc, index) => {
    let docText = `**${doc.title}** (${doc.filename})`;
    
    if (doc.relevantText) {
      docText += `\n${doc.relevantText}`;
    }
    
    if (doc.created_at) {
      const date = new Date(doc.created_at).toLocaleDateString('de-DE');
      docText += `\n*Erstellt: ${date}*`;
    }
    
    return `${index + 1}. ${docText}`;
  }).join('\n\n');

  return formattedDocs;
};

/**
 * Creates a form notice element for knowledge/instruction status
 * @param {Object} params - Parameters for creating the notice
 * @param {Object} params.source - Knowledge source from store
 * @param {boolean} params.isLoadingGroupDetails - Whether group details are loading
 * @param {boolean} params.isInstructionsActive - Whether instructions are active
 * @param {Object} params.instructions - User instructions object
 * @param {string} params.instructionType - Type of instruction ('antrag' or 'social')
 * @param {Object} params.groupDetailsData - Group details data
 * @param {Array} params.availableKnowledge - Available knowledge items
 * @returns {JSX.Element|null} Form notice element or null
 */
export const createKnowledgeFormNotice = ({
  source,
  isLoadingGroupDetails,
  isInstructionsActive,
  instructions,
  instructionType,
  groupDetailsData,
  availableKnowledge,
}) => {
  if (source.type === 'group' && isLoadingGroupDetails) {
    return (
      <div className="custom-prompt-notice">
        <HiInformationCircle className="info-icon" />
        <span>Lade Gruppenanweisungen & Wissen...</span>
      </div>
    );
  }

  let noticeParts = [];
  let sourceNameForNotice = "";

  if (source.type === 'user') {
    sourceNameForNotice = "Persönliche";
    if (isInstructionsActive && instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen`);
    } else if (instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
    }
  } else if (source.type === 'group') {
    sourceNameForNotice = source.name || 'Gruppe';
    const groupInstructionKey = instructionType === 'antrag' ? 'custom_antrag_prompt' : 'custom_social_prompt';
    if (groupDetailsData?.instructions?.[groupInstructionKey]) {
      noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
    }
  }

  const hasLoadedKnowledge = availableKnowledge.length > 0;

  if (source.type !== 'neutral' && hasLoadedKnowledge) {
    if (source.type === 'user') {
      noticeParts.push('gesamtes persönliches Wissen');
    } else if (source.type === 'group') {
      noticeParts.push(`gesamtes Wissen der Gruppe "${sourceNameForNotice}"`);
    }
  }
  

  if (noticeParts.length === 0 && source.type === 'neutral') {
    return null;
  }

  if (noticeParts.length === 0) return null;

  const fullNoticeText = noticeParts.join('. ');

  return (
    <div className="custom-prompt-notice">
      <HiInformationCircle className="info-icon" />
      <span>{fullNoticeText}.</span>
    </div>
  );
};

/**
 * Retrieves relevant memories from mem0 based on search query
 * @param {string} query - Search query (usually theme/topic from form)
 * @param {string} generatorType - Type of generator for relevance filtering
 * @param {string} userId - User ID for memory retrieval
 * @param {number} limit - Maximum number of memories to retrieve
 * @returns {Promise<Array>} Array of relevant memories
 */
export const getMemories = async (query, generatorType, userId, limit = 5) => {
  if (!query?.trim() || !userId) {
    return [];
  }

  try {
    console.log('[getMemories] Searching memories for:', { query, generatorType, userId, limit });
    
    const response = await fetch(`${AUTH_BASE_URL}/api/mem0/search`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query.trim()
      }),
    });

    if (!response.ok) {
      console.warn('[getMemories] Search failed:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('[getMemories] Search response:', data);

    if (!data.success || !Array.isArray(data.data?.results)) {
      console.warn('[getMemories] No results found');
      return [];
    }

    // Filter and limit results
    let memories = data.data.results;
    
    // Prioritize memories that match the generator type
    if (generatorType) {
      memories = memories.sort((a, b) => {
        const aMatches = a.metadata?.generator_type === generatorType;
        const bMatches = b.metadata?.generator_type === generatorType;
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    // Limit results to prevent context bloat
    memories = memories.slice(0, limit);

    console.log(`[getMemories] Returning ${memories.length} relevant memories`);
    return memories;

  } catch (error) {
    console.warn('[getMemories] Error retrieving memories:', error.message);
    return []; // Fail silently - memory retrieval shouldn't block generation
  }
};

/**
 * Formats memories into a structured string for prompt integration
 * @param {Array} memories - Array of memory objects from mem0
 * @param {string} generatorType - Type of generator for context-specific formatting
 * @returns {string|null} Formatted memory string or null if no memories
 */
export const formatMemories = (memories, generatorType) => {
  if (!Array.isArray(memories) || memories.length === 0) {
    return null;
  }

  const formattedMemories = memories.map((memory, index) => {
    let memoryText = memory.memory || memory.text || '';
    
    // Add context from metadata if available
    if (memory.metadata) {
      const context = [];
      if (memory.metadata.topic) {
        context.push(`Thema: ${memory.metadata.topic}`);
      }
      if (memory.metadata.generator_type && memory.metadata.generator_type !== generatorType) {
        context.push(`Kontext: ${memory.metadata.generator_type}`);
      }
      
      if (context.length > 0) {
        memoryText = `${memoryText} (${context.join(', ')})`;
      }
    }
    
    return `${index + 1}. ${memoryText}`;
  }).join('\n');

  return formattedMemories;
};

/**
 * Creates a structured prompt with knowledge, instructions, memories, and documents
 * @param {Object} params - Parameters for creating the prompt
 * @param {Object} params.source - Knowledge source from store
 * @param {boolean} params.isInstructionsActive - Whether instructions are active
 * @param {Function} params.getActiveInstruction - Function to get active instruction
 * @param {string} params.instructionType - Type of instruction ('antrag' or 'social')
 * @param {Object} params.groupDetailsData - Group details data
 * @param {Function} params.getKnowledgeContent - Function to get knowledge content
 * @param {Function} params.getDocumentContent - Function to get selected document content
 * @param {string} params.additionalContent - Additional content to include
 * @param {Object} params.memoryOptions - Options for memory retrieval
 * @param {string} params.memoryOptions.query - Search query for memories
 * @param {string} params.memoryOptions.generatorType - Generator type for relevance
 * @param {string} params.memoryOptions.userId - User ID for memory retrieval
 * @param {boolean} params.memoryOptions.enableMemories - Whether to include memories
 * @param {Object} params.documentOptions - Options for document retrieval
 * @param {string} params.documentOptions.query - Search query for documents
 * @param {string} params.documentOptions.userId - User ID for document retrieval
 * @param {boolean} params.documentOptions.enableDocuments - Whether to include documents
 * @returns {Promise<string|null>} Structured prompt or null
 */
export const createKnowledgePrompt = async ({
  source,
  isInstructionsActive,
  getActiveInstruction,
  instructionType,
  groupDetailsData,
  getKnowledgeContent,
  getDocumentContent,
  additionalContent = '',
  memoryOptions = {},
  documentOptions = {}
}) => {
  console.log('[createKnowledgePrompt] DEBUG: Starting with options:', {
    source,
    isInstructionsActive,
    instructionType,
    memoryOptions,
    documentOptions,
    hasGroupData: !!groupDetailsData
  });

  // Get active instruction based on source
  let activeInstruction = null;
  if (source.type === 'user' && isInstructionsActive) {
    activeInstruction = getActiveInstruction(instructionType);
  } else if (source.type === 'group' && groupDetailsData?.instructions) {
    const groupInstructionKey = instructionType === 'antrag' ? 'custom_antrag_prompt' : 'custom_social_prompt';
    activeInstruction = groupDetailsData.instructions[groupInstructionKey];
  }
  
  // Get knowledge content from store
  const knowledgeContent = getKnowledgeContent();
  
  // Get selected document content from store (with intelligent extraction if query available)
  let selectedDocumentContent = null;
  if (getDocumentContent) {
    try {
      // Use memory query if available for intelligent document content extraction
      const searchQuery = memoryOptions.query || documentOptions.query || null;
      console.log('[createKnowledgePrompt] DEBUG: Calling getDocumentContent with query:', searchQuery);
      
      selectedDocumentContent = await getDocumentContent(searchQuery);
      
      console.log('[createKnowledgePrompt] DEBUG: Document content retrieved:', {
        hasContent: !!selectedDocumentContent,
        contentLength: selectedDocumentContent?.length || 0,
        usedIntelligentExtraction: !!searchQuery
      });
    } catch (error) {
      console.error('[createKnowledgePrompt] Error getting document content:', error);
      // Continue without selected documents - don't let document errors block generation
    }
  }
  
  console.log('[createKnowledgePrompt] DEBUG: Content retrieved:', {
    hasActiveInstruction: !!activeInstruction,
    hasKnowledgeContent: !!knowledgeContent,
    hasSelectedDocuments: !!selectedDocumentContent,
    memoryEnabled: memoryOptions.enableMemories,
    hasQuery: !!memoryOptions.query,
    hasUserId: !!memoryOptions.userId,
    documentsEnabled: documentOptions.enableDocuments,
    hasDocumentQuery: !!documentOptions.query,
    hasDocumentUserId: !!documentOptions.userId
  });
  
  // Retrieve and format memories if enabled
  let memoryContent = null;
  if (memoryOptions.enableMemories && memoryOptions.query && memoryOptions.userId) {
    console.log('[createKnowledgePrompt] DEBUG: Attempting memory retrieval with:', {
      query: memoryOptions.query,
      generatorType: memoryOptions.generatorType,
      userId: memoryOptions.userId
    });
    
    try {
      const memories = await getMemories(
        memoryOptions.query,
        memoryOptions.generatorType,
        memoryOptions.userId
      );
      console.log('[createKnowledgePrompt] DEBUG: Memory retrieval successful:', {
        memoriesCount: memories?.length || 0,
        memories: memories
      });
      
      memoryContent = formatMemories(memories, memoryOptions.generatorType);
      console.log('[createKnowledgePrompt] DEBUG: Memory content formatted:', {
        memoryContentLength: memoryContent?.length || 0,
        memoryContent: memoryContent?.substring(0, 200) + '...'
      });
    } catch (error) {
      console.warn('[createKnowledgePrompt] Memory retrieval failed:', error.message);
      console.error('[createKnowledgePrompt] Memory retrieval error details:', error);
      // Continue without memories - don't let memory errors block generation
    }
  } else {
    console.log('[createKnowledgePrompt] DEBUG: Memory retrieval skipped because:', {
      enableMemories: memoryOptions.enableMemories,
      hasQuery: !!memoryOptions.query,
      hasUserId: !!memoryOptions.userId
    });
  }
  
  // Retrieve and format documents if enabled
  let documentContent = null;
  if (documentOptions.enableDocuments && documentOptions.query && documentOptions.userId) {
    console.log('[createKnowledgePrompt] DEBUG: Attempting document retrieval with:', {
      query: documentOptions.query,
      userId: documentOptions.userId
    });
    
    try {
      const documents = await getDocuments(
        documentOptions.query,
        documentOptions.userId,
        3 // Limit to 3 documents
      );
      console.log('[createKnowledgePrompt] DEBUG: Document retrieval successful:', {
        documentsCount: documents?.length || 0,
        documents: documents
      });
      
      documentContent = formatDocuments(documents);
      console.log('[createKnowledgePrompt] DEBUG: Document content formatted:', {
        documentContentLength: documentContent?.length || 0,
        documentContent: documentContent?.substring(0, 200) + '...'
      });
    } catch (error) {
      console.warn('[createKnowledgePrompt] Document retrieval failed:', error.message);
      console.error('[createKnowledgePrompt] Document retrieval error details:', error);
      // Continue without documents - don't let document errors block generation
    }
  } else {
    console.log('[createKnowledgePrompt] DEBUG: Document retrieval skipped because:', {
      enableDocuments: documentOptions.enableDocuments,
      hasQuery: !!documentOptions.query,
      hasUserId: !!documentOptions.userId
    });
  }
  
  const finalPrompt = createPromptWithMemories(
    activeInstruction,
    knowledgeContent,
    memoryContent,
    additionalContent,
    documentContent, // API-searched documents
    selectedDocumentContent // Selected documents from store
  );
  
  console.log('[createKnowledgePrompt] DEBUG: Final prompt created:', {
    finalPromptLength: finalPrompt?.length || 0,
    hasMemoryContent: !!memoryContent,
    hasDocumentContent: !!documentContent,
    hasSelectedDocumentContent: !!selectedDocumentContent,
    finalPromptPreview: finalPrompt?.substring(0, 300) + '...'
  });
  
  return finalPrompt;
};