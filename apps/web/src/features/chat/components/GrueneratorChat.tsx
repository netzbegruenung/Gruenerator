import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import ChatWorkbenchLayout from '../../../components/common/Chat/ChatWorkbenchLayout';
import GrueneratorChatMessage from './GrueneratorChatMessage';
import { useChatStore } from '../../../stores/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { useChatApi } from '../hooks/useChatApi';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { validateFiles, prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { resolveTextContent } from '../utils/textResolvers';
import apiClient from '../../../components/utils/apiClient';
import '../../../assets/styles/components/chat/chat-workbench.css';

interface AttachedFile extends File {
  name: string;
  type: string;
  size: number;
}

interface ChatMsg {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp?: number;
  agent?: string;
  componentId?: string;
}

const EXAMPLE_QUESTIONS = [
  { icon: '📝', text: 'Schreib einen Instagram-Post über Klimaschutz' },
  { icon: '📸', text: 'Erstelle ein Sharepic zum Thema Solarenergie' },
  { icon: '📰', text: 'Verfasse eine Pressemitteilung' }
];

const GrueneratorChat = () => {
  const [inputValue, setInputValue] = useState('');
  const [isEditModeActive, setIsEditModeActive] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const messages = useChatStore(useShallow(state => state.messages));
  const currentAgent = useChatStore(state => state.currentAgent);
  const isLoading = useChatStore(state => state.isLoading);
  const error = useChatStore(state => state.error);
  const initializeChat = useChatStore(state => state.initializeChat);
  const setError = useChatStore(state => state.setError);
  const clearMessages = useChatStore(state => state.clearMessages);
  const multiResults = useChatStore(useShallow(state => state.multiResults));
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

  const handleSubmit = useCallback(async (message: string) => {
    console.log('[GrueneratorChat] Message submit started:', message?.substring(0, 50) + '...');

    if (!message?.trim() || isLoading) return;

    // Check for reset keywords
    const resetKeywords = ['neustart', 'reset', 'neu starten', 'neustarten', 'von vorne', 'clear'];
    const normalizedMessage = message.trim().toLowerCase();

    if (resetKeywords.includes(normalizedMessage)) {
      clearMessages();
      clearMultiResults();
      setActiveResultId(null);
      setInputValue('');
      setIsEditModeActive(false);
      setError(null);
      setAttachedFiles([]);

      try {
        await apiClient.delete('/chat/clear');
      } catch (err) {
        console.warn('Failed to clear backend session:', err);
      }

      setTimeout(() => initializeChat(), 100);
      return;
    }

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
        } catch (err) {
          console.error('[GrueneratorChat] File processing error:', err);
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
      } else {
        console.log('[GrueneratorChat] No attached files to process');
      }

      if (isEditModeActive) {
        await sendEditInstruction(message);
      } else {
        await sendMessage(message, { attachments: processedFiles });
      }

      // Clear attached files after successful send
      if (attachedFiles.length > 0) {
        console.log('[GrueneratorChat] Clearing attached files after send');
        setAttachedFiles([]);
      }
    } catch (err) {
      console.error('[GrueneratorChat] Error sending message:', err);
      // Error is already handled in useChatApi
    }
  }, [sendMessage, sendEditInstruction, isLoading, isEditModeActive, attachedFiles, setError, clearMessages, clearMultiResults, setActiveResultId, initializeChat]);

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
      lastAssistantMessage?.agent !== 'simple_response'
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

  const handleEditRequest = useCallback((componentId: string) => {
    if (!componentId) return;

    if (isEditModeActive && activeResultId === componentId) {
      setIsEditModeActive(false);
      setActiveResultId(null);
      setError(null);
      return;
    }

    // Find the result reference in multiResults
    const target = multiResults.find(result => result.componentId === componentId);
    if (!target) return;

    // Get content from generatedTextStore (single source of truth)
    const textStore = useGeneratedTextStore.getState();
    const storedContent = textStore.generatedTexts?.[componentId];
    const resolved = resolveTextContent(storedContent);
    if (!resolved.trim()) return;

    const storedMetadata = (textStore.generatedTextMetadata?.[componentId] || {}) as Record<string, unknown>;
    const metadata = {
      agent: target.agent,
      ...storedMetadata,
      ...target.metadata
    };

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

  const handleFileSelect = useCallback(async (files: AttachedFile[]) => {
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
    } catch (err) {
      console.error('[GrueneratorChat] File validation error:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  }, []);

  const handleReset = useCallback(async () => {
    if (window.confirm('Möchten Sie wirklich den gesamten Chat zurücksetzen? Alle Nachrichten und generierte Texte gehen verloren.')) {
      try {
        // Clear backend data first
        const response = await apiClient.delete('/chat/clear');
        console.log('Backend data cleared:', response.data);
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

  const renderMessage = useCallback((msg: ChatMsg, index: number) => {
    return (
      <GrueneratorChatMessage
        key={msg.timestamp || `msg-${index}`}
        msg={msg}
        index={index}
        onEditRequest={handleEditRequest}
        isEditModeActive={isEditModeActive}
        activeResultId={activeResultId}
      />
    );
  }, [handleEditRequest, isEditModeActive, activeResultId]);

  const placeholder = useMemo(() => {
    if (isEditModeActive) {
      return 'Beschreib kurz, welche Änderungen ich am Text vornehmen soll.';
    }

    if (currentAgent) {
      const placeholders = {
        'social_media': 'Welchen Social Media Post möchtest du erstellen?',
        'pressemitteilung': 'Über welches Thema soll die Pressemitteilung sein?',
        'antrag': 'Welchen Antrag möchtest du verfassen?',
        'zitat': 'Zu welchem Thema soll das Zitat sein?',
        'leichte_sprache': 'Welchen Text soll ich in leichte Sprache übersetzen?',
        'gruene_jugend': 'Welchen aktivistischen Text brauchst du?',
        'universal': 'Was möchtest du schreiben?'
      };
      return placeholders[currentAgent] || 'Deine Nachricht...';
    }
    return 'Sag mir, was du brauchst - z.B. "Schreib einen Facebook-Post über Klimaschutz"';
  }, [isEditModeActive, currentAgent]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="gruenerator-chat-container"
    >
      <ChatWorkbenchLayout
        mode="chat"
        modes={{ chat: { label: 'Chat' } }}
        onModeChange={() => {}}
        messages={messages as Array<{ type: 'user' | 'assistant' | 'error'; content: string; timestamp?: number }>}
        onSubmit={handleSubmit}
        isProcessing={isLoading}
        placeholder={placeholder}
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={isLoading}
        renderMessage={renderMessage}
        className="gruenerator-chat-layout"
        isEditModeActive={isEditModeActive}
        onReset={handleReset}
        hideModeSelector={true}
        hideHeader={true}
        enableFileUpload={true}
        onFileSelect={handleFileSelect}
        attachedFiles={attachedFiles}
        onRemoveFile={handleRemoveFile}
        showStartPage={true}
        startPageTitle="Was kann ich für dich tun?"
        exampleQuestions={EXAMPLE_QUESTIONS}
      />
    </motion.div>
  );
};

export default GrueneratorChat;
