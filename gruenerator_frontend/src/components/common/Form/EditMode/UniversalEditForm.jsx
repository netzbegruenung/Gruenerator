import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import ChatUI from '../../Chat/ChatUI';
import apiClient from '../../../utils/apiClient';
import useTextEditActions from '../../../../stores/hooks/useTextEditActions';

const UniversalEditForm = ({ componentName }) => {
  const { getEditableText, applyEdits } = useTextEditActions(componentName);

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initial assistant prompt
    setMessages([
      {
        type: 'assistant',
        content: 'Beschreibe kurz, was wir am Text verbessern sollen – ich mache Vorschläge und wende sie direkt an. ✨',
        timestamp: Date.now()
      }
    ]);
  }, []);

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
        // Apply edits and summarize
        applyEdits(changes);
        const summary = [
          `Ich habe ${changes.length} Änderung(en) angewendet:`,
          ...changes.slice(0, 5).map((c, i) => `- Ersetzt: „${c.text_to_find}” → „${c.replacement_text}”`),
          changes.length > 5 ? '…' : ''
        ].filter(Boolean).join('\n');
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
            <div 
              className="input-elements"
              style={{ 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                padding: 12,
                background: 'transparent'
              }}
            >
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
              <button 
                type="button" 
                onClick={() => inputValue.trim() && handleSubmit(inputValue)}
                disabled={!inputValue.trim()}
                style={{ 
                  width: 32, 
                  height: 32, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center'
                }}
                aria-label="Verbesserung senden"
              >
                ➤
              </button>
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
