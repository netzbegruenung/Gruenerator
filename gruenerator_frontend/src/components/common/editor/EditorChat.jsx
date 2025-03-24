import React, { useState, useCallback, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import { TbRobot } from "react-icons/tb";
import { useClaudeResponse } from './hooks/useClaudeResponse';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const EditorChat = ({ isEditing }) => {
  const [message, setMessage] = useState('');
  const { value, selectedText } = useContext(FormContext);
  const { processClaudeRequest } = useClaudeResponse();
  const [isInitialTyping, setIsInitialTyping] = useState(true);
  const [chatHistory, setChatHistory] = useState([
    { 
      type: 'assistant', 
      content: 'Hi!👋 Ich bin dein Grünerator-Assistent und helfe dir gerne bei der Textbearbeitung. Was soll ich ändern?'
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  // useEffect mit verzögerter Hinzufügung und Prüfung, ob der Text bereits existiert
  useEffect(() => {
    const timer = setTimeout(() => {
      setChatHistory(prev => {
        if (!prev.some(msg => msg.content.includes('markiere einfach'))) {
          return [
            ...prev,
            {
              type: 'assistant',
              content: 'Du kannst mir Änderungswünsche zum gesamten Text stellen oder markiere einfach einen bestimmten Textabschnitt, den ich dir optimieren soll.📝'
            }
          ];
        }
        return prev;
      });
      setIsInitialTyping(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!message.trim() || isProcessing) return;

    const editorElement = document.querySelector('.ql-editor');
    if (!editorElement) {
      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: message },
        { type: 'error', content: 'Editor nicht gefunden. Bitte laden Sie die Seite neu.' }
      ]);
      return;
    }

    setIsProcessing(true);
    try {
      const textToProcess = selectedText && selectedText.trim().length > 0 
        ? selectedText 
        : null;

      const chatMessage = await processClaudeRequest(message, textToProcess);
      
      setChatHistory(prev => [
        ...prev, 
        { type: 'user', content: message },
        { type: 'assistant', content: chatMessage }
      ]);
      
      setMessage('');
    } catch (error) {
      console.error('Error in chat:', error);
      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: message },
        { type: 'error', content: 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.' }
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [message, isProcessing, processClaudeRequest, selectedText]);

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
        {isInitialTyping && (
          <div className="chat-message assistant">
            <TbRobot className="assistant-icon" />
            <DotLottieReact
              src="https://lottie.host/04e97ff1-7ebe-4cc5-bcc4-982febcd8fed/LGkR9GEJ3D.lottie"
              loop
              autoplay
              style={{ width: '32px', height: '32px' }}
            />
          </div>
        )}
      </div>
      {selectedText && selectedText.trim() && (
        <div className="selected-text-display">
          „{selectedText}“
        </div>
      )}
      <form onSubmit={handleSubmit} className="editor-chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={selectedText && selectedText.trim() 
            ? "Textabschnitt anpassen..." 
            : "Ganzen Text anpassen..."}
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !message.trim()}>
          {isProcessing ? (
            <DotLottieReact
              src="https://lottie.host/04e97ff1-7ebe-4cc5-bcc4-982febcd8fed/LGkR9GEJ3D.lottie"
              loop
              autoplay
              style={{ width: '32px', height: '32px' }}
            />
          ) : '➤'}
        </button>
      </form>
    </div>
  );
};

EditorChat.propTypes = {
  isEditing: PropTypes.bool.isRequired
};

export default EditorChat;
