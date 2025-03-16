import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import { TbRobot } from "react-icons/tb";
import { useClaudeResponse } from './useClaudeResponse';
import './EditorChat.css';

const EditorChat = ({ isEditing }) => {
  const [message, setMessage] = useState('');
  const { value, quillRef } = useContext(FormContext);
  const { processClaudeRequest } = useClaudeResponse();
  const [chatHistory, setChatHistory] = useState([
    { 
      type: 'assistant', 
      content: 'Willkommen! Ich bin dein KI-Assistent für die Textbearbeitung. Du kannst mir Anweisungen geben, wie ich deinen Text verbessern soll, z.B. "Mache den Text formeller" oder "Korrigiere die Rechtschreibung". Wie kann ich dir helfen?' 
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!message.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const quill = quillRef.current?.getEditor();
      const cursorPosition = quill ? quill.getSelection()?.index : null;
      const selectedRange = quill?.getSelection();
      
      const chatMessage = await processClaudeRequest(message, value, cursorPosition, selectedRange, quill);
      
      setChatHistory(prev => [...prev, 
        { type: 'user', content: message },
        { type: 'assistant', content: chatMessage }
      ]);
      
      setMessage('');
    } catch (error) {
      console.error('Error in chat:', error);
      setChatHistory(prev => [...prev,
        { type: 'user', content: message },
        { type: 'error', content: 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.' }
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [message, isProcessing, value, quillRef, processClaudeRequest]);

  if (!isEditing) return null;

  return (
    <div className="editor-chat">
      <div className="editor-chat-header">
        <h3>Editor Chat</h3>
      </div>
      <div className="editor-chat-messages">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.type}`}>
            {msg.type === 'assistant' && <TbRobot className="assistant-icon" />}
            {msg.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="editor-chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Schreibe eine Nachricht..."
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !message.trim()}>
          {isProcessing ? '...' : '➤'}
        </button>
      </form>
    </div>
  );
};

EditorChat.propTypes = {
  isEditing: PropTypes.bool.isRequired
};

export default EditorChat; 