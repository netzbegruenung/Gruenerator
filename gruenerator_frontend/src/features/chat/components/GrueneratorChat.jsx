import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { HiChip, HiChat } from 'react-icons/hi';
import ChatWorkbenchLayout from '../../../components/common/Chat/ChatWorkbenchLayout';
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import FormStateProvider from '../../../components/common/Form/FormStateProvider';
import ResultsDeck from './ResultsDeck';
import StartPage from './StartPage';
import { useChatStore } from '../../../stores/chatStore';
import { shallow } from 'zustand/shallow';
import { useChatApi } from '../hooks/useChatApi';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { validateFiles, prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { resolveTextContent } from '../utils/textResolvers';
import '../../../assets/styles/components/chat/chat-workbench.css';

const GrueneratorChat = () => {
  const INITIAL_GREETING = 'Hallo! Ich bin der Grünerator Chat. Ich kann Ihnen bei der Texterstellung helfen. Sagen Sie mir einfach, was Sie benötigen - einen Social Media Post, eine Pressemitteilung, einen Antrag oder etwas anderes. Ich wähle automatisch den passenden Assistenten für Sie aus.';
  const [inputValue, setInputValue] = useState('');
  const [viewMode, setViewMode] = useState('dossier');
  const [isEditModeActive, setIsEditModeActive] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);

  const messages = useChatStore(state => state.messages, shallow);
  const currentAgent = useChatStore(state => state.currentAgent);
  const isLoading = useChatStore(state => state.isLoading);
  const error = useChatStore(state => state.error);
  const initializeChat = useChatStore(state => state.initializeChat);
  const setError = useChatStore(state => state.setError);
  const clearMessages = useChatStore(state => state.clearMessages);
  const multiResults = useChatStore(state => state.multiResults, shallow);
  const clearMultiResults = useChatStore(state => state.clearMultiResults);
  const activeResultId = useChatStore(state => state.activeResultId);
  const setActiveResultId = useChatStore(state => state.setActiveResultId);

  const { sendMessage, sendEditInstruction } = useChatApi();

  const generatedContent = useGeneratedTextStore(state => state.generatedTexts['grueneratorChat'] || '');
  const setGeneratedText = useGeneratedTextStore(state => state.setGeneratedText);

  // Initialize chat on mount
  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  useEffect(() => {
    if (activeResultId && !multiResults.some(result => result.componentId === activeResultId)) {
      setActiveResultId(null);
    }
  }, [activeResultId, multiResults, setActiveResultId]);

  // Clear error when input changes
  useEffect(() => {
    if (error && inputValue.trim()) {
      setError(null);
    }
  }, [inputValue, error, setError]);

  const handleSubmit = useCallback(async (message) => {
    console.log('[GrueneratorChat] Message submit started:', message?.substring(0, 50) + '...');

    if (!message?.trim() || isLoading) return;

    try {
      setInputValue('');

      // Prepare files if any are attached
      let processedFiles = null;
      if (attachedFiles.length > 0) {
        console.log('[GrueneratorChat] Processing attached files:', attachedFiles.length, 'files');
        console.log('[GrueneratorChat] Attached files:', attachedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

        try {
          processedFiles = await prepareFilesForSubmission(attachedFiles);
          console.log('[GrueneratorChat] Files processed successfully:', processedFiles?.length || 0, 'processed files');
        } catch (error) {
          console.error('[GrueneratorChat] File processing error:', error);
          setError(error.message);
          return;
        }
      } else {
        console.log('[GrueneratorChat] No attached files to process');
      }

      if (isEditModeActive) {
        await sendEditInstruction(message, processedFiles);
      } else {
        await sendMessage(message, { attachments: processedFiles });
      }

      // Clear attached files after successful send
      if (attachedFiles.length > 0) {
        console.log('[GrueneratorChat] Clearing attached files after send');
        setAttachedFiles([]);
      }
    } catch (error) {
      console.error('[GrueneratorChat] Error sending message:', error);
      // Error is already handled in useChatApi
    }
  }, [sendMessage, sendEditInstruction, isLoading, isEditModeActive, attachedFiles, setError]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
        return msg;
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    const latestContent = lastAssistantMessage?.content?.trim();
    if (
      !generatedContent &&
      multiResults.length === 0 &&
      latestContent &&
      latestContent !== INITIAL_GREETING.trim()
    ) {
      setGeneratedText('grueneratorChat', latestContent, currentAgent ? { agent: currentAgent } : undefined);
    }
  }, [
    generatedContent,
    multiResults.length,
    lastAssistantMessage,
    setGeneratedText,
    currentAgent
  ]);

  const introHelpContent = useMemo(() => {
    if (isEditModeActive) {
      return null;
    }

    if (!currentAgent && messages.length <= 1) {
      return {
        content: 'Willkommen beim Grünerator Chat! Ich kann Ihnen bei verschiedenen Textarten helfen:',
        tips: [
          'Social Media Posts – Facebook, Instagram, Twitter',
          'Pressemitteilungen – Professionelle Medientexte',
          'Anträge – Kommunalpolitische Vorlagen',
          'Zitate – Kurze, prägnante Aussagen',
          'Leichte Sprache – Barrierefreie Texte',
          'Jugendsprache – Aktivistische Inhalte'
        ]
      };
    }
    return null;
  }, [currentAgent, messages.length, isEditModeActive]);

  const getChatExportableContent = useCallback(() => {
    if (typeof generatedContent === 'string' && generatedContent) {
      return generatedContent;
    }

    if (generatedContent && typeof generatedContent === 'object') {
      if (typeof generatedContent.content === 'string') {
        return generatedContent.content;
      }
      if (generatedContent.social?.content) {
        return generatedContent.social.content;
      }
    }

    return lastAssistantMessage?.content || '';
  }, [generatedContent, lastAssistantMessage]);

  const handleToggleEditMode = useCallback(() => {
    const textStore = useGeneratedTextStore.getState();

    if (isEditModeActive) {
      setError(null);
      setIsEditModeActive(false);
      setActiveResultId(null);
      return;
    }

    if (activeResultId) {
      const target = multiResults.find(result => result.componentId === activeResultId);
      if (target) {
        const resolved = resolveTextContent(target.content);
        if (!resolved.trim()) {
          return;
        }
        const metadata = {
          agent: target.agent,
          ...(target.content?.metadata || target.metadata || {})
        };
        if (typeof textStore.pushToHistory === 'function') {
          textStore.pushToHistory('grueneratorChat');
        }
        setGeneratedText('grueneratorChat', resolved, metadata);
      }
    } else if (!generatedContent && lastAssistantMessage?.content) {
      if (typeof textStore.pushToHistory === 'function') {
        textStore.pushToHistory('grueneratorChat');
      }
      setGeneratedText('grueneratorChat', lastAssistantMessage.content, currentAgent ? { agent: currentAgent } : undefined);
    }

    setError(null);
    setIsEditModeActive(true);
  }, [
    isEditModeActive,
    activeResultId,
    multiResults,
    generatedContent,
    lastAssistantMessage,
    setGeneratedText,
    currentAgent,
    setError,
    setActiveResultId
  ]);

  const handleDeckEditRequest = useCallback((componentId) => {
    if (!componentId) return;

    if (isEditModeActive && activeResultId === componentId) {
      setIsEditModeActive(false);
      setActiveResultId(null);
      setError(null);
      return;
    }

    const target = multiResults.find(result => result.componentId === componentId);
    if (!target) return;

    const resolved = resolveTextContent(target.content);
    if (!resolved.trim()) return;

    const metadata = {
      agent: target.agent,
      ...(target.content?.metadata || target.metadata || {})
    };

    const textStore = useGeneratedTextStore.getState();
    if (typeof textStore.pushToHistory === 'function') {
      textStore.pushToHistory('grueneratorChat');
    }
    setGeneratedText('grueneratorChat', resolved, metadata);
    setActiveResultId(componentId);
    setError(null);
    if (!isEditModeActive) {
      setIsEditModeActive(true);
    }
  }, [
    multiResults,
    setGeneratedText,
    setActiveResultId,
    setError,
    isEditModeActive,
    activeResultId
  ]);

  const handleFileSelect = useCallback(async (files) => {
    console.log('[GrueneratorChat] File upload started:', files?.length || 0, 'files');
    console.log('[GrueneratorChat] Files selected:', files?.map(f => ({ name: f.name, type: f.type, size: f.size })) || []);

    try {
      // Validate files first
      console.log('[GrueneratorChat] Validating files...');
      validateFiles(files);
      console.log('[GrueneratorChat] Files validated successfully');
      setAttachedFiles(files);
      console.log('[GrueneratorChat] Files attached to state');
      setError(null);
    } catch (error) {
      console.error('[GrueneratorChat] File validation error:', error);
      setError(error.message);
    }
  }, [setError]);

  const handleRemoveFile = useCallback((index) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  }, []);

  const handleReset = useCallback(async () => {
    if (window.confirm('Möchten Sie wirklich den gesamten Chat zurücksetzen? Alle Nachrichten und generierte Texte gehen verloren.')) {
      try {
        // Clear backend data first
        const response = await fetch('/api/chat/clear', {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.warn('Failed to clear backend data:', response.status, response.statusText);
          // Continue with frontend reset even if backend fails
        } else {
          const result = await response.json();
          console.log('Backend data cleared:', result);
        }

      } catch (error) {
        console.error('Error clearing backend data:', error);
        // Continue with frontend reset even if backend fails
      }

      // Clear frontend state
      clearMessages();
      setActiveResultId(null);
      setInputValue('');
      setIsEditModeActive(false);
      setError(null);
      setAttachedFiles([]);

      // Reinitialize chat with welcome message
      setTimeout(() => {
        initializeChat();
      }, 100);
    }
  }, [clearMessages, setError, initializeChat, setActiveResultId]);

  const displayValue = useMemo(() => {
    if (typeof generatedContent === 'string' && generatedContent) {
      return generatedContent;
    }

    if (generatedContent && typeof generatedContent === 'object') {
      if (typeof generatedContent.content === 'string') {
        return generatedContent.content;
      }
      if (generatedContent.social?.content) {
        return generatedContent.social.content;
      }
    }

    return lastAssistantMessage?.content || '';
  }, [generatedContent, lastAssistantMessage]);

  const shouldHideInitialGreeting = useMemo(() => {
    if (multiResults.length > 0) return false;
    if (!displayValue) return false;
    return displayValue.trim() === INITIAL_GREETING.trim();
  }, [displayValue, multiResults.length]);

  const effectiveDisplayValue = shouldHideInitialGreeting ? '' : displayValue;
  const effectiveGeneratedContent = shouldHideInitialGreeting ? generatedContent : (generatedContent || effectiveDisplayValue);

  const renderRightPanelContent = () => {
    if (multiResults.length > 0) {
      return (
        <ResultsDeck
          results={multiResults}
          onClear={clearMultiResults}
          introHelpContent={introHelpContent}
          onEditRequest={handleDeckEditRequest}
          onReset={handleReset}
          activeResultId={activeResultId}
          isEditModeActive={isEditModeActive}
        />
      );
    }

    return (
      <FormStateProvider formId="grueneratorChatDisplay">
        <DisplaySection
          title="Generierter Text"
          error={error || undefined}
          value={effectiveDisplayValue}
          generatedContent={effectiveGeneratedContent}
          useMarkdown={true}
          helpContent={introHelpContent}
          getExportableContent={getChatExportableContent}
          componentName="grueneratorChat"
          onErrorDismiss={() => setError(null)}
          onEditModeToggle={handleToggleEditMode}
          isEditModeActive={isEditModeActive}
          showResetButton={true}
          onReset={handleReset}
          renderEmptyState={() => (
            <StartPage introHelpContent={introHelpContent} />
          )}
        />
      </FormStateProvider>
    );
  };

  const placeholder = useMemo(() => {
    if (isEditModeActive) {
      return 'Beschreibe kurz, welche Änderungen ich am Text vornehmen soll.';
    }

    if (currentAgent) {
      const placeholders = {
        'social_media': 'Welchen Social Media Post möchten Sie erstellen?',
        'pressemitteilung': 'Über welches Thema soll die Pressemitteilung sein?',
        'antrag': 'Welchen Antrag möchten Sie verfassen?',
        'zitat': 'Zu welchem Thema soll das Zitat sein?',
        'leichte_sprache': 'Welchen Text soll ich in leichte Sprache übersetzen?',
        'gruene_jugend': 'Welchen aktivistischen Text benötigen Sie?',
        'universal': 'Was möchten Sie schreiben?'
      };
      return placeholders[currentAgent] || 'Ihre Nachricht...';
    }
    return 'Sagen Sie mir, was Sie benötigen - z.B. "Schreibe einen Facebook-Post über Klimaschutz"';
  }, [isEditModeActive, currentAgent]);

  const modes = useMemo(() => ({
    dossier: { label: 'Dossier', icon: HiChat },
    chat: { label: 'Chat', icon: HiChip }
  }), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="gruenerator-chat-container"
    >
      <ChatWorkbenchLayout
        mode={viewMode}
        modes={modes}
        onModeChange={setViewMode}
        messages={messages}
        onSubmit={handleSubmit}
        isProcessing={isLoading}
        placeholder={placeholder}
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={isLoading}
        rightPanelContent={renderRightPanelContent()}
        className="gruenerator-chat-layout"
        enableVoiceInput={false} // Disable voice input for now
        isEditModeActive={isEditModeActive}
        onReset={handleReset}
        hideModeSelector={true}
        enableVoiceRecorder={true}
        enableFileUpload={true}
        onFileSelect={handleFileSelect}
        attachedFiles={attachedFiles}
        onRemoveFile={handleRemoveFile}
      />
    </motion.div>
  );
};

export default GrueneratorChat;
