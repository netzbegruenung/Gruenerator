import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import ChatUI from '../../Chat/ChatUI';
import ChatWorkbenchLayout from '../../Chat/ChatWorkbenchLayout';
import { MESSAGE_MOTION_PROPS, MARKDOWN_COMPONENTS } from '../../Chat/utils/chatMessageUtils';
import apiClient from '../../../utils/apiClient';
import useTextEditActions from '../../../../stores/hooks/useTextEditActions';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { extractEditableText } from '../../../../stores/hooks/useTextEditActions';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useProfile } from '../../../../features/auth/hooks/useProfileData';
import useHeaderStore from '../../../../stores/headerStore';
import useResponsive from '../hooks/useResponsive';
import ActionButtons from '../../ActionButtons';
import '../../../../assets/styles/components/edit-mode/edit-mode-overlay.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const UniversalEditForm = ({ componentName }) => {
  const { getEditableText, applyEdits } = useTextEditActions(componentName);
  const storeContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || null);

  const { user } = useOptimizedAuth();
  const { data: profile } = useProfile(user?.id);
  const displayName = profile?.display_name || '';
  const setForceShrunk = useHeaderStore((state) => state.setForceShrunk);

  // Mobile detection
  const { isMobileView } = useResponsive(768);

  useEffect(() => {
    setForceShrunk(true);
    return () => setForceShrunk(false);
  }, [setForceShrunk]);

  // Desktop messages (summaries)
  const [messages, setMessages] = useState([]);
  // Mobile messages (full text as content)
  const [mobileMessages, setMobileMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);
  const mobileInitializedRef = useRef(false);

  const editableText = extractEditableText(storeContent) || '';
  const hasEditableText = editableText.trim().length > 0;
  const hasSharepic = Boolean(storeContent && typeof storeContent === 'object' && storeContent.sharepic);
  const isSharepicOnly = hasSharepic && !hasEditableText;

  useEffect(() => {
    if (isSharepicOnly) {
      return;
    }
    if (!initializedRef.current) {
      const existingMessages = useGeneratedTextStore.getState().getEditChat(componentName);

      if (existingMessages.length > 0) {
        setMessages(existingMessages);
      } else {
        const firstName = displayName ? displayName.split(' ')[0] : '';
        const greeting = firstName ? `Hey ${firstName}! ` : '';
        setMessages([
          {
            type: 'assistant',
            content: `${greeting}Beschreibe kurz, was wir am Text verbessern sollen – ich mache Vorschläge und wende sie direkt an. ✨`,
            timestamp: Date.now()
          }
        ]);
      }
      initializedRef.current = true;
    }
  }, [componentName, isSharepicOnly, displayName]);

  useEffect(() => {
    if (isSharepicOnly) {
      return;
    }
    if (initializedRef.current && messages.length > 0) {
      useGeneratedTextStore.getState().setEditChat(componentName, messages);
    }
  }, [messages, componentName, isSharepicOnly]);

  // Mobile messages initialization - show greeting + current text as first edit result
  useEffect(() => {
    if (isSharepicOnly || !isMobileView) {
      return;
    }
    if (!mobileInitializedRef.current) {
      const firstName = displayName ? displayName.split(' ')[0] : '';
      const greeting = firstName ? `Hey ${firstName}! ` : '';
      const currentText = extractEditableText(storeContent);

      const initialMobileMessages = [
        {
          type: 'assistant',
          content: `${greeting}Beschreibe kurz, was wir verbessern sollen.`,
          timestamp: Date.now()
        }
      ];

      // Add current text as the first edit result message
      if (currentText?.trim()) {
        initialMobileMessages.push({
          type: 'assistant',
          content: currentText,
          timestamp: Date.now() + 1,
          isEditResult: true,
          editSummary: 'Aktueller Text'
        });
      }

      setMobileMessages(initialMobileMessages);
      mobileInitializedRef.current = true;
    }
  }, [isMobileView, isSharepicOnly, displayName, storeContent]);

  // Custom message renderer for mobile - shows full text for edit results
  const renderMobileEditMessage = useCallback((msg, index) => {
    if (msg.type === 'assistant' && msg.isEditResult) {
      return (
        <motion.div
          key={msg.timestamp || index}
          className="chat-message assistant edit-result-message"
          {...MESSAGE_MOTION_PROPS}
        >
          <ActionButtons
            generatedContent={msg.content}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="edit-message-actions"
          />
          <div className="edit-result-content">
            <div className="edit-result-text">
              <Suspense fallback={<span>{msg.content}</span>}>
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {msg.content}
                </ReactMarkdown>
              </Suspense>
            </div>
          </div>
        </motion.div>
      );
    }

    // Default rendering for user/error/regular assistant messages
    return (
      <motion.div
        key={msg.timestamp || index}
        className={`chat-message ${msg.type}`}
        {...MESSAGE_MOTION_PROPS}
      >
        <div className="chat-message-content">
          <Suspense fallback={<span>{msg.content}</span>}>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {msg.content}
            </ReactMarkdown>
          </Suspense>
        </div>
      </motion.div>
    );
  }, []);

  const handleSubmit = useCallback(async (instruction) => {
    if (isSharepicOnly || !hasEditableText) {
      return;
    }
    const trimmed = (instruction || '').trim();
    if (!trimmed) return;

    const userMsg = { type: 'user', content: trimmed, timestamp: Date.now() };
    // Add user message to appropriate message list
    if (isMobileView) {
      setMobileMessages(prev => [...prev, userMsg]);
    } else {
      setMessages(prev => [...prev, userMsg]);
    }
    setInputValue('');

    const currentText = getEditableText();
    if (!currentText) {
      const errorMsg = { type: 'error', content: 'Kein Text vorhanden, den ich verbessern kann.', timestamp: Date.now() };
      if (isMobileView) {
        setMobileMessages(prev => [...prev, errorMsg]);
      } else {
        setMessages(prev => [...prev, errorMsg]);
      }
      return;
    }

    const attemptFrontendParsing = (rawData) => {
      if (!rawData?.raw) return null;

      try {
        let cleaned = rawData.raw
          .replace(/```json\s*|\s*```/g, '')
          .replace(/(\*\*|__|~~)\s*"/g, '"')
          .replace(/"\s*(\*\*|__|~~)/g, '"')
          .trim();

        const parsed = JSON.parse(cleaned);
        if (parsed.changes && Array.isArray(parsed.changes)) {
          return parsed;
        }
      } catch (e) {
        console.warn('[UniversalEditForm] Frontend parsing failed:', e.message);
      }
      return null;
    };

    setIsProcessing(true);
    try {
      const response = await apiClient.post('/claude_suggest_edits', {
        instruction: trimmed,
        currentText,
        componentName
      });

      let data = response?.data;
      if (data?.needsFrontendParsing) {
        const frontendParsed = attemptFrontendParsing(data);
        if (frontendParsed) {
          data = frontendParsed;
        }
      }

      const changes = data?.changes || [];

      if (!Array.isArray(changes) || changes.length === 0) {
        const noChangesMsg = { type: 'assistant', content: 'Keine konkreten Änderungen vorgeschlagen. Präzisiere gern, was verändert werden soll.', timestamp: Date.now() };
        if (isMobileView) {
          setMobileMessages(prev => [...prev, noChangesMsg]);
        } else {
          setMessages(prev => [...prev, noChangesMsg]);
        }
      } else {
        const result = applyEdits(changes);

        if (result.appliedCount === 0) {
          const errorMsg = {
            type: 'error',
            content: 'Die Änderungen konnten nicht angewendet werden. Der Text wurde möglicherweise bereits verändert. Bitte versuche es erneut oder formuliere die Änderung anders.',
            timestamp: Date.now()
          };
          if (isMobileView) {
            setMobileMessages(prev => [...prev, errorMsg]);
          } else {
            setMessages(prev => [...prev, errorMsg]);
          }
        } else if (result.appliedCount < result.totalCount) {
          // Partial success - on mobile, show the updated text anyway
          if (isMobileView) {
            const updatedText = getEditableText();
            setMobileMessages(prev => [...prev, {
              type: 'assistant',
              content: updatedText,
              timestamp: Date.now(),
              isEditResult: true,
              editSummary: `⚠️ Nur ${result.appliedCount} von ${result.totalCount} Änderungen angewendet`
            }]);
          } else {
            setMessages(prev => [...prev, {
              type: 'assistant',
              content: `⚠️ Nur ${result.appliedCount} von ${result.totalCount} Änderungen konnten angewendet werden. Einige Textpassagen wurden möglicherweise bereits verändert.`,
              timestamp: Date.now()
            }]);
          }
        } else {
          let summary = response?.data?.summary;

          if (!summary) {
            const isFullReplace = changes.length === 1 && changes[0].full_replace === true;

            if (isFullReplace) {
              summary = '✅ Text komplett umgeschrieben!';
            } else {
              const describeChange = (change) => {
                if (!change.replacement_text || change.replacement_text.trim() === '') {
                  return `🗑️ Entfernt: „${change.text_to_find.substring(0, 60)}${change.text_to_find.length > 60 ? '...' : ''}"`;
                }

                if (change.replacement_text.includes(change.text_to_find)) {
                  const addedPart = change.replacement_text.replace(change.text_to_find, '').trim();
                  if (addedPart) {
                    return `➕ Hinzugefügt: „${addedPart.substring(0, 60)}${addedPart.length > 60 ? '...' : ''}"`;
                  }
                }

                if (change.text_to_find.includes(change.replacement_text) && change.replacement_text) {
                  return `✂️ Gekürzt: „${change.text_to_find.substring(0, 30)}..." → „${change.replacement_text.substring(0, 30)}..."`;
                }

                return `✏️ Geändert: „${change.text_to_find.substring(0, 30)}${change.text_to_find.length > 30 ? '...' : ''}" → „${change.replacement_text.substring(0, 30)}${change.replacement_text.length > 30 ? '...' : ''}"`;
              };

              summary = [
                `✅ ${changes.length} ${changes.length === 1 ? 'Änderung' : 'Änderungen'} angewendet:`,
                ...changes.slice(0, 5).map(describeChange),
                changes.length > 5 ? `... und ${changes.length - 5} weitere` : ''
              ].filter(Boolean).join('\n');
            }
          }

          // Mobile: show full updated text, Desktop: show summary
          if (isMobileView) {
            const updatedText = getEditableText();
            const editSummary = `✅ ${changes.length} ${changes.length === 1 ? 'Änderung' : 'Änderungen'} angewendet`;
            setMobileMessages(prev => [...prev, {
              type: 'assistant',
              content: updatedText,
              timestamp: Date.now(),
              isEditResult: true,
              editSummary
            }]);
          } else {
            setMessages(prev => [...prev, { type: 'assistant', content: summary, timestamp: Date.now() }]);
          }
        }
      }
    } catch (e) {
      const errText = e?.response?.data?.error || e.message || 'Fehler bei der Verarbeitung';
      const errorMsg = { type: 'error', content: errText, timestamp: Date.now() };
      if (isMobileView) {
        setMobileMessages(prev => [...prev, errorMsg]);
      } else {
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [getEditableText, applyEdits, hasEditableText, isSharepicOnly, isMobileView]);

  if (isSharepicOnly) {
    return null;
  }

  // Mobile: full chat takeover with ChatWorkbenchLayout
  if (isMobileView) {
    return (
      <div className="universal-edit-form mobile-chat">
        <ChatWorkbenchLayout
          mode="chat"
          modes={{ chat: { label: 'Edit' } }}
          onModeChange={() => {}}
          messages={mobileMessages}
          onSubmit={handleSubmit}
          isProcessing={isProcessing}
          placeholder="Was soll ich verbessern?"
          inputValue={inputValue}
          onInputChange={setInputValue}
          renderMessage={renderMobileEditMessage}
          hideHeader={true}
          hideModeSelector={true}
          singleLine={true}
        />
      </div>
    );
  }

  // Desktop: embedded ChatUI with custom input
  return (
    <div className="universal-edit-form enhanced">
      <ChatUI
        messages={messages}
        onSubmit={handleSubmit}
        isProcessing={isProcessing}
        placeholder="Was möchtest du verbessern?"
        inputValue={inputValue}
        onInputChange={setInputValue}
        className="chat-embedded"
        showHeader={false}
        renderInput={() => (
          <div className="floating-input">
            <div className="input-elements">
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '16px' }}
                inputMode="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Was möchtest du verbessern?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (inputValue.trim()) {
                      handleSubmit(inputValue);
                    }
                  }
                }}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
};

UniversalEditForm.propTypes = {
  componentName: PropTypes.string.isRequired
};

export default UniversalEditForm;
