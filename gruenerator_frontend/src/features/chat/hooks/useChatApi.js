import { useCallback } from 'react';
import apiClient, { processText } from '../../../components/utils/apiClient';
import { useChatStore } from '../../../stores/chatStore';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { applyChangesToContent, extractEditableText } from '../../../stores/hooks/useTextEditActions';
import {
  getSingleResultMessage,
  getEditSuccessMessage,
  getErrorMessage,
  getNoChangesMessage
} from '../utils/chatMessages';
import { generateMultiResultMessage } from '../utils/assistantPhrases';

const SHAREPIC_AGENT_SET = new Set(['dreizeilen', 'headline', 'info', 'zitat', 'quote', 'zitat_pure']);

const mergeRelatedResults = (results) => {
  if (!results || results.length < 2) {
    return results;
  }

  const textResults = [];
  const sharepicResults = [];

  for (const result of results) {
    const hasSharepic = !!result?.content?.sharepic;
    const isSharepicAgent = SHAREPIC_AGENT_SET.has(result?.agent);

    if (hasSharepic || isSharepicAgent) {
      sharepicResults.push(result);
    } else {
      textResults.push(result);
    }
  }

  console.log('[useChatApi] mergeRelatedResults analysis:', {
    total: results.length,
    textResults: textResults.length,
    sharepicResults: sharepicResults.length,
    textAgents: textResults.map(r => r.agent),
    sharepicAgents: sharepicResults.map(r => r.agent)
  });

  if (textResults.length === 1 && sharepicResults.length === 1) {
    const textResult = textResults[0];
    const sharepicResult = sharepicResults[0];

    const mergedResult = {
      ...textResult,
      id: textResult.id || `merged_${Date.now()}`,
      title: 'Text & Sharepic',
      content: {
        ...textResult.content,
        text: textResult.content.text,
        sharepic: sharepicResult.content.sharepic,
        sharepicTitle: sharepicResult.content.sharepicTitle || sharepicResult.title,
        sharepicDownloadText: sharepicResult.content.sharepicDownloadText,
        sharepicDownloadFilename: sharepicResult.content.sharepicDownloadFilename,
        enableKiLabel: sharepicResult.content.enableKiLabel,
        onSharepicUpdate: sharepicResult.content.onSharepicUpdate,
        onEditSharepic: sharepicResult.content.onEditSharepic,
        showEditButton: sharepicResult.content.showEditButton
      },
      mergedFrom: {
        text: textResult.agent,
        sharepic: sharepicResult.agent
      }
    };

    console.log('[useChatApi] Merged text and sharepic results:', {
      textAgent: textResult.agent,
      sharepicAgent: sharepicResult.agent,
      mergedTitle: mergedResult.title
    });

    return [mergedResult];
  }

  return results;
};

const normalizeChatResponse = (response) => {
  if (!response) {
    return response;
  }

  const normalized = { ...response };
  const { content, metadata } = normalized;

  let normalizedContent = null;
  if (typeof content === 'string') {
    normalizedContent = { text: content };
  } else if (content && typeof content === 'object') {
    normalizedContent = { ...content };
  }

  if (normalizedContent && !normalizedContent.metadata && metadata) {
    normalizedContent.metadata = metadata;
  }

  normalized.content = normalizedContent;

  return normalized;
};

/**
 * Custom hook for handling Grünerator Chat API interactions
 * Extends the useApiSubmit pattern specifically for the /api/chat endpoint
 */
export const useChatApi = () => {
  const {
    addMessage,
    setLoading,
    setError,
    handleAgentResponse,
    handleMultiAgentResponses,
    clearMultiResults,
    getApiContext,
    currentAgent,
    updateContext,
    getLastGeneratedText
  } = useChatStore();

  const { user } = useAuthStore();

  /**
   * Parse different response formats based on agent type
   * @param {Object} response - Raw API response
   * @returns {Object} Parsed response with formatted content
   */
  const parseResponse = useCallback((response) => {
    const normalized = normalizeChatResponse(response);

    if (!normalized?.content) {
      return normalized;
    }

    const { agent, content } = normalized;

    // Handle different agent response formats
    switch (agent) {
      case 'zitat':
      case 'quote':
      case 'zitat_pure': {
        let quotes = Array.isArray(content.quotes) ? content.quotes : null;
        let formattedText = content.text;

        if (typeof content.text === 'string' && content.text.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(content.text);
            if (Array.isArray(parsed)) {
              quotes = parsed.map(item => (typeof item === 'string' ? item : item?.quote).trim()).filter(Boolean);
              formattedText = quotes.map(q => `"${q}"`).join('\n\n');
            }
          } catch (error) {
            console.warn('[useChatApi] Failed to parse quote array:', error);
          }
        }

        const primaryQuote = quotes?.[0] || (typeof content.quote === 'string' ? content.quote : null) || formattedText;

        return {
          ...normalized,
          content: {
            ...content,
            text: formattedText,
            quotes: quotes || content.quotes || (primaryQuote ? [primaryQuote] : []),
            sharepicSource: {
              quote: typeof primaryQuote === 'string' ? primaryQuote : primaryQuote?.quote || '',
              alternatives: quotes?.slice(1) || [],
              name: content.name || content.metadata?.name || null
            }
          }
        };
      }

      case 'info':
        // Info responses have structured data
        if (content.header && content.subheader && content.body) {
          return {
            ...normalized,
            content: {
              ...content,
              text: `**${content.header}**\n\n*${content.subheader}*\n\n${content.body}`,
              structured: {
                header: content.header,
                subheader: content.subheader,
                body: content.body
              },
              sharepicSource: {
                header: content.header,
                subheader: content.subheader,
                body: content.body,
                alternatives: content.alternatives || []
              }
            }
          };
        }
        break;

      case 'headline':
      case 'dreizeilen':
        // Headline/dreizeilen responses have line-based structure
        if (content.mainSlogan) {
          const mainSlogan = Array.isArray(content.mainSlogan)
            ? content.mainSlogan
            : content.mainSlogan;

          const lines = Array.isArray(mainSlogan)
            ? mainSlogan
            : [mainSlogan.line1, mainSlogan.line2, mainSlogan.line3].filter(Boolean);

          return {
            ...normalized,
            content: {
              ...content,
              text: lines.join('\n'),
              lines,
              sharepicSource: {
                mainSlogan: Array.isArray(mainSlogan)
                  ? {
                      line1: mainSlogan[0] || '',
                      line2: mainSlogan[1] || '',
                      line3: mainSlogan[2] || ''
                    }
                  : mainSlogan,
                alternatives: content.alternatives || []
              }
            }
          };
        }
        break;

      case 'information_request':
        // Handle information requests - these are questions asking for missing info
        return {
          ...normalized,
          content: {
            ...content,
            text: content.text,
            metadata: {
              ...content.metadata,
              isInformationRequest: true
            }
          },
          actions: [
            { label: 'Ja', value: 'ja', style: 'primary' },
            { label: 'Nein', value: 'nein', style: 'secondary' }
          ]
        };

      case 'websearch_offer':
        // Handle web search offers - ask user if they want to search
        return {
          ...normalized,
          content: {
            ...content,
            text: content.text,
            metadata: {
              ...content.metadata,
              isWebSearchOffer: true
            }
          },
          actions: [
            { label: 'Ja', value: 'ja', style: 'primary' },
            { label: 'Nein', value: 'nein', style: 'secondary' }
          ]
        };

      default:
        // Default handling for standard text responses
        break;
    }

    return normalized;
  }, []);

  /**
   * Send a message to the chat API
   * @param {string} message - The user's message
   * @param {Object} options - Additional options for the API call
   */
  const sendMessage = useCallback(async (message, options = {}) => {
    if (!message?.trim()) {
      setError(getErrorMessage('empty_message'));
      return;
    }

    setLoading(true);
    setError(null);

    // Add user message immediately with attachment metadata
    const safeOptions = options || {};
    const attachmentMeta = safeOptions.attachments?.length > 0
      ? safeOptions.attachments.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size,
          displayType: f.displayType || f.type
        }))
      : null;

    const userMessage = {
      type: 'user',
      content: message.trim(),
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie',
      attachments: attachmentMeta
    };

    addMessage(userMessage);

    try {
      // Prepare API request with context
      const context = getApiContext();
      const requestData = {
        message: message.trim(),
        context,
        usePrivacyMode: safeOptions.usePrivacyMode || false,
        provider: safeOptions.provider || null,
        attachments: safeOptions.attachments || [],
        ...safeOptions
      };

      console.log('[useChatApi] Sending request:', {
        messageLength: message.length,
        hasContext: Object.keys(context).length > 0,
        currentAgent,
        provider: requestData.provider
      });

      // Call the chat API
      const rawResponse = await processText('chat', requestData);

      if (rawResponse?.multiResponse) {
        const intentResults = Array.isArray(rawResponse.results) ? rawResponse.results : [];

        console.log('[useChatApi] Received multi-response payload:', {
          totalResults: intentResults.length,
          successful: intentResults.filter(result => result?.success || result?.content?.success).length
        });

        const successfulResponses = [];

        for (let index = 0; index < intentResults.length; index++) {
          const intentResult = intentResults[index];
          if (!intentResult) continue;

          const baseContent = intentResult.content && typeof intentResult.content === 'object'
            ? { ...intentResult.content }
            : null;

          const responsePayload = baseContent
            ? {
                ...baseContent,
                success: baseContent.success ?? intentResult.success,
                agent: baseContent.agent || intentResult.agent,
                metadata: baseContent.metadata ?? intentResult.metadata
              }
            : {
                success: intentResult.success,
                agent: intentResult.agent,
                content: intentResult.content,
                metadata: intentResult.metadata
              };

          if (!responsePayload.content && baseContent) {
            responsePayload.content = baseContent.content ?? baseContent;
          }

          if (!responsePayload.success) {
            console.warn('[useChatApi] Skipping intent without success flag:', intentResult.agent);
            continue;
          }

          if (!responsePayload.agent) {
            console.warn('[useChatApi] Skipping intent without agent identifier');
            continue;
          }

          const normalizedIntentResponse = normalizeChatResponse(responsePayload);
          const parsedIntentResponse = parseResponse(normalizedIntentResponse);

          if (intentResult.confidence !== undefined) {
            parsedIntentResponse.confidence = intentResult.confidence;
          }

          if (!parsedIntentResponse.id) {
            const fallbackAgent = intentResult.agent || parsedIntentResponse.agent || 'intent';
            parsedIntentResponse.id = intentResult.processingIndex != null
              ? `intent_${intentResult.processingIndex}`
              : `intent_${fallbackAgent}_${index}`;
          }

          if (!parsedIntentResponse.title) {
            parsedIntentResponse.title = parsedIntentResponse.content?.metadata?.title
              || parsedIntentResponse.content?.title
              || parsedIntentResponse.agent;
          }

          const hasTextContent = typeof parsedIntentResponse?.content?.text === 'string'
            && parsedIntentResponse.content.text.trim().length > 0;
          const hasSharepicContent = !!parsedIntentResponse?.content?.sharepic;

          if (!parsedIntentResponse?.success || (!hasTextContent && !hasSharepicContent)) {
            console.warn('[useChatApi] Skipping intent without usable content:', responsePayload.agent);
            continue;
          }

          // Handle information requests and websearch offers as direct chat messages in multi-agent flow
          if (parsedIntentResponse.agent === 'information_request' || parsedIntentResponse.agent === 'websearch_offer') {
            addMessage({
              type: 'assistant',
              content: parsedIntentResponse.content.text,
              timestamp: Date.now(),
              agent: parsedIntentResponse.agent,
              actions: parsedIntentResponse.actions
            });
            continue; // Don't add to results, just show in chat
          }

          // Collect successful parsed intent responses; defer store updates to dedicated handler
          successfulResponses.push(parsedIntentResponse);
        }

        if (successfulResponses.length === 0) {
          // If we only had information requests, that's okay - they were already added to chat
          return [];
        }

        const mergedResponses = mergeRelatedResults(successfulResponses);
        handleMultiAgentResponses(mergedResponses);

        addMessage({
          type: 'assistant',
          content: generateMultiResultMessage(mergedResponses),
          timestamp: Date.now(),
          agent: 'multi_intent_summary'
        });

        return mergedResponses;
      }

      const normalizedResponse = normalizeChatResponse(rawResponse);
      const parsedResponse = parseResponse(normalizedResponse);

      console.log('[useChatApi] Received response:', {
        success: parsedResponse?.success,
        agent: parsedResponse?.agent,
        hasContent: !!parsedResponse?.content,
        contentLength: parsedResponse?.content?.text?.length || 0,
        hasSuggestions: !!parsedResponse?.suggestions
      });

      // Validate response structure
      if (!parsedResponse || !parsedResponse.success) {
        throw new Error(parsedResponse?.error || getErrorMessage('unexpected_response'));
      }

      if (!parsedResponse.agent) {
        throw new Error(getErrorMessage('no_agent'));
      }

      if (!parsedResponse.content?.text && !parsedResponse.content?.sharepic && parsedResponse.agent !== 'information_request' && parsedResponse.agent !== 'websearch_offer' && parsedResponse.agent !== 'simple_response') {
        throw new Error(getErrorMessage('no_content'));
      }

      // Handle information requests, websearch offers, and simple responses as direct chat messages
      if (parsedResponse.agent === 'information_request' || parsedResponse.agent === 'websearch_offer' || parsedResponse.agent === 'simple_response') {
        addMessage({
          type: 'assistant',
          content: parsedResponse.content.text,
          timestamp: Date.now(),
          agent: parsedResponse.agent,
          actions: parsedResponse.actions
        });
        return parsedResponse;
      }

      // Always get existing results and append new response
      const currentStore = useChatStore.getState();
      const existingResults = currentStore.multiResults || [];

      // Convert single response to multi-result format
      const newResult = {
        ...parsedResponse,
        id: parsedResponse.id || `single_${Date.now()}`,
        title: parsedResponse.content?.metadata?.title || parsedResponse.agent,
        componentId: `result_${existingResults.length}_${Date.now()}`
      };

      // Add to existing results
      const allResults = [...existingResults, newResult];
      handleMultiAgentResponses(allResults);

      addMessage({
        type: 'assistant',
        content: getSingleResultMessage(parsedResponse.agent, newResult.title),
        timestamp: Date.now(),
        agent: parsedResponse.agent
      });

      return parsedResponse;

    } catch (error) {
      console.error('[useChatApi] Error sending message:', error);

      // Add error message to chat
      const errorMessage = {
        type: 'error',
        content: getErrorMessage('general_error', error.message || 'Unbekannter Fehler beim Senden der Nachricht'),
        timestamp: Date.now()
      };

      addMessage(errorMessage);
      setError(error.message || getErrorMessage('general_error'));

      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    addMessage,
    setLoading,
    setError,
    parseResponse,
    handleAgentResponse,
    handleMultiAgentResponses,
    clearMultiResults,
    getApiContext,
    currentAgent,
    user
  ]);

  const sendEditInstruction = useCallback(async (instruction) => {
    const trimmedInstruction = (instruction || '').trim();
    if (!trimmedInstruction) {
      setError(getErrorMessage('empty_instruction'));
      return;
    }

    const textStore = useGeneratedTextStore.getState();
    let currentContent = textStore.generatedTexts?.grueneratorChat;

    if (!currentContent) {
      const fallback = getLastGeneratedText();
      if (fallback) {
        textStore.setGeneratedText('grueneratorChat', fallback, currentAgent ? { agent: currentAgent } : undefined);
        currentContent = fallback;
      }
    }

    const editableText = extractEditableText(currentContent) || (typeof currentContent === 'string' ? currentContent : '');

    if (!editableText) {
      const fallbackMessage = getErrorMessage('no_text_to_edit');
      const timestamp = Date.now();
      addMessage({ type: 'error', content: fallbackMessage, timestamp });
      setError(fallbackMessage);
      return;
    }

    setLoading(true);
    setError(null);

    const userMessage = {
      type: 'user',
      content: trimmedInstruction,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie'
    };

    addMessage(userMessage);

    try {
      const response = await apiClient.post('/claude_suggest_edits', {
        instruction: trimmedInstruction,
        currentText: editableText
      });

      const changes = Array.isArray(response?.data?.changes) ? response.data.changes : [];
      const summaryFromApi = response?.data?.summary;

      if (changes.length === 0) {
        addMessage({
          type: 'assistant',
          content: summaryFromApi || getNoChangesMessage(),
          timestamp: Date.now(),
          agent: 'edit'
        });
        return;
      }

      const metadata = textStore.generatedTextMetadata?.grueneratorChat || {};

      if (typeof textStore.pushToHistory === 'function') {
        textStore.pushToHistory('grueneratorChat');
      }

      const updatedContentRaw = applyChangesToContent(currentContent, changes) ?? currentContent;
      const updatedTextString = extractEditableText(updatedContentRaw) || (typeof updatedContentRaw === 'string' ? updatedContentRaw : editableText);

      if (typeof textStore.setTextWithHistory === 'function') {
        textStore.setTextWithHistory('grueneratorChat', updatedTextString, metadata);
      } else {
        if (typeof textStore.pushToHistory === 'function') {
          textStore.pushToHistory('grueneratorChat');
        }
        textStore.setGeneratedText('grueneratorChat', updatedTextString, metadata);
      }

      updateContext({ lastGeneratedText: updatedTextString });

      const chatState = useChatStore.getState();
      if (chatState.activeResultId) {
        const targetResult = typeof chatState.getResultById === 'function'
          ? chatState.getResultById(chatState.activeResultId)
          : chatState.multiResults?.find(result => result.componentId === chatState.activeResultId);

        if (targetResult && typeof chatState.updateMultiResultContent === 'function') {
          if (targetResult.content && typeof targetResult.content === 'object' && targetResult.content.sharepic) {
            const baseContent = targetResult.content;
            const nextContent = {
              ...baseContent,
              text: updatedTextString,
              content: updatedTextString,
              social: baseContent.social && typeof baseContent.social === 'object'
                ? { ...baseContent.social, content: updatedTextString }
                : baseContent.social
            };
            chatState.updateMultiResultContent(chatState.activeResultId, nextContent);
          } else {
            chatState.updateMultiResultContent(chatState.activeResultId, updatedTextString);
          }
        }
      }

      const successSummary = summaryFromApi || getEditSuccessMessage(changes.length);
      addMessage({
        type: 'assistant',
        content: successSummary,
        timestamp: Date.now(),
        agent: 'edit'
      });
    } catch (error) {
      console.error('[useChatApi] Error applying edit instruction:', error);
      const errorMessage = error?.response?.data?.error || error.message || 'Fehler bei der Bearbeitung';
      addMessage({
        type: 'error',
        content: getErrorMessage('general_error', errorMessage),
        timestamp: Date.now()
      });
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    addMessage,
    setLoading,
    setError,
    updateContext,
    getLastGeneratedText,
    user,
    currentAgent
  ]);

  /**
   * Check if the last response is ready for sharepic generation
   * @returns {boolean} True if sharepic generation is available
   */
  const isSharepicReady = useCallback(() => {
    const { messages, currentAgent } = useChatStore.getState();

    if (!currentAgent) return false;

    const sharepicAgents = ['zitat', 'quote', 'info', 'headline', 'dreizeilen'];
    return sharepicAgents.includes(currentAgent);
  }, []);

  /**
   * Get suggestions for follow-up actions
   * @returns {Array} Array of suggestion objects
   */
  const getFollowUpSuggestions = useCallback(() => {
    const { currentAgent, messages } = useChatStore.getState();

    if (!currentAgent || messages.length === 0) {
      return [
        { text: 'Social Media Post erstellen', action: 'social_media' },
        { text: 'Pressemitteilung schreiben', action: 'pressemitteilung' },
        { text: 'Antrag verfassen', action: 'antrag' }
      ];
    }

    const suggestions = [];

    // Agent-specific suggestions
    switch (currentAgent) {
      case 'social_media':
      case 'pressemitteilung':
        suggestions.push(
          { text: 'Zitat daraus erstellen', action: 'zitat' },
          { text: 'In leichte Sprache übersetzen', action: 'leichte_sprache' }
        );
        break;

      case 'zitat':
      case 'quote':
        suggestions.push(
          { text: 'Sharepic erstellen', action: 'sharepic' },
          { text: 'Social Media Post daraus machen', action: 'social_media' }
        );
        break;

      case 'antrag':
        suggestions.push(
          { text: 'Zusammenfassung erstellen', action: 'universal' },
          { text: 'Pressemitteilung daraus schreiben', action: 'pressemitteilung' }
        );
        break;

      default:
        suggestions.push(
          { text: 'Anderes Format erstellen', action: 'universal' }
        );
    }

    // Always add some general suggestions
    suggestions.push(
      { text: 'Neues Thema beginnen', action: 'clear' }
    );

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }, []);

  return {
    sendMessage,
    parseResponse,
    isSharepicReady,
    getFollowUpSuggestions,
    sendEditInstruction
  };
};

export default useChatApi;
