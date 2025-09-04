import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import ChatUI from '../../Chat/ChatUI';
import apiClient from '../../../utils/apiClient';
import useTextEditActions from '../../../../stores/hooks/useTextEditActions';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';

const UniversalEditForm = ({ componentName }) => {
  const { getEditableText, applyEdits } = useTextEditActions(componentName);

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);
  // No emoji hardcoding here; AI decides if/when to add emojis

  useEffect(() => {
    // Only initialize once per component
    if (!initializedRef.current) {
      const existingMessages = useGeneratedTextStore.getState().getEditChat(componentName);
      
      if (existingMessages.length > 0) {
        setMessages(existingMessages);
      } else {
        setMessages([
          {
            type: 'assistant',
            content: 'Beschreibe kurz, was wir am Text verbessern sollen – ich mache Vorschläge und wende sie direkt an. ✨',
            timestamp: Date.now()
          }
        ]);
      }
      initializedRef.current = true;
    }
  }, [componentName]);

  // Save messages to store whenever they change (but skip initial load)
  useEffect(() => {
    if (initializedRef.current && messages.length > 0) {
      useGeneratedTextStore.getState().setEditChat(componentName, messages);
    }
  }, [messages, componentName]);

  const handleSubmit = useCallback(async (instruction) => {
    const trimmed = (instruction || '').trim();
    if (!trimmed) return;

    // Add user message
    const userMsg = { type: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Get current text
    const currentText = getEditableText();
    if (!currentText) {
      setMessages(prev => [...prev, { type: 'error', content: 'Kein Text vorhanden, den ich verbessern kann.', timestamp: Date.now() }]);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await apiClient.post('/claude_suggest_edits', {
        instruction: trimmed,
        currentText
      });
      const changes = response?.data?.changes || [];

      if (!Array.isArray(changes) || changes.length === 0) {
        setMessages(prev => [...prev, { type: 'assistant', content: 'Keine konkreten Änderungen vorgeschlagen. Präzisiere gern, was verändert werden soll.', timestamp: Date.now() }]);
      } else {
        // Apply edits
        applyEdits(changes);
        
        // Use AI's summary if available, otherwise generate one
        let summary = response?.data?.summary;
        
        if (!summary) {
          // Fallback to smart detection
          const describeChange = (change) => {
            // Deletion: empty or whitespace-only replacement
            if (!change.replacement_text || change.replacement_text.trim() === '') {
              return `🗑️ Entfernt: „${change.text_to_find.substring(0, 60)}${change.text_to_find.length > 60 ? '...' : ''}"`;
            }
            
            // Addition: replacement contains original text plus more
            if (change.replacement_text.includes(change.text_to_find)) {
              const addedPart = change.replacement_text.replace(change.text_to_find, '').trim();
              if (addedPart) {
                return `➕ Hinzugefügt: „${addedPart.substring(0, 60)}${addedPart.length > 60 ? '...' : ''}"`;
              }
            }
            
            // Shortening: original contains replacement
            if (change.text_to_find.includes(change.replacement_text) && change.replacement_text) {
              return `✂️ Gekürzt: „${change.text_to_find.substring(0, 30)}..." → „${change.replacement_text.substring(0, 30)}..."`;
            }
            
            // Regular replacement
            return `✏️ Geändert: „${change.text_to_find.substring(0, 30)}${change.text_to_find.length > 30 ? '...' : ''}" → „${change.replacement_text.substring(0, 30)}${change.replacement_text.length > 30 ? '...' : ''}"`;
          };

          // Generate fallback summary
          summary = [
            `✅ ${changes.length} ${changes.length === 1 ? 'Änderung' : 'Änderungen'} angewendet:`,
            ...changes.slice(0, 5).map(describeChange),
            changes.length > 5 ? `... und ${changes.length - 5} weitere` : ''
          ].filter(Boolean).join('\n');
        }
        
        setMessages(prev => [...prev, { type: 'assistant', content: summary, timestamp: Date.now() }]);
      }
    } catch (e) {
      const errText = e?.response?.data?.error || e.message || 'Fehler bei der Verarbeitung';
      setMessages(prev => [...prev, { type: 'error', content: errText, timestamp: Date.now() }]);
    } finally {
      setIsProcessing(false);
    }
  }, [getEditableText, applyEdits]);

  return (
    <div className="universal-edit-form enhanced">
      <ChatUI
        messages={messages}
        onSubmit={handleSubmit}
        isProcessing={isProcessing}
        placeholder="Was möchtest du verbessern?"
        inputValue={inputValue}
        onInputChange={setInputValue}
        className="editor-chat-embedded"
        renderInput={() => (
          <div className="floating-input">
            <div className="input-elements">
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, minWidth: 0, margin: 0 }}
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
