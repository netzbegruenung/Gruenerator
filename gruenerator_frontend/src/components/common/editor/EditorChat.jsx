import React, { useState, useCallback, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import { TbRobot } from "react-icons/tb";
import { useClaudeResponse } from './hooks/useClaudeResponse';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import EditorChatHeader from './EditorChatHeader';


const EditorChat = ({ isEditing }) => {
  const [message, setMessage] = useState('');
  const [chatMode, setChatMode] = useState('edit');
  const { 
    value, 
    selectedText, 
    handleAiResponse, 
    quillRef, 
    setOriginalContent, 
    setIsAdjusting 
  } = useContext(FormContext);
  
  const { processClaudeRequest } = useClaudeResponse({
    handleAiResponse,
    quillRef,
    setOriginalContent,
    value,
    setIsAdjusting
  });
  const [isInitialTyping, setIsInitialTyping] = useState(true);
  const [chatHistory, setChatHistory] = useState([
    { 
      type: 'assistant', 
      content: 'Hi!👋 Ich bin dein Grünerator-Assistent und helfe dir gerne bei der Textbearbeitung. Was soll ich ändern?'
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatContainerRef = useRef(null);
  // Eine Referenz für den letzten Nachrichtenindex
  const lastMessageIndexRef = useRef(0);
  // Referenz für das Scroll-Timeout
  const scrollTimeoutRef = useRef(null);

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

  // Aktualisierter useEffect für sanftes Scrollen
  useEffect(() => {
    // Nur prüfen, wenn neue Nachrichten hinzugefügt wurden
    if (chatHistory.length > lastMessageIndexRef.current) {
      const lastMessage = chatHistory[chatHistory.length - 1];
      
      // Nur scrollen wenn es eine Systemnachricht ist und wenn wir mehr als 2 Nachrichten haben
      if ((lastMessage.type === 'assistant' || lastMessage.type === 'error') && chatHistory.length > 2) {
        // Vorheriges Timeout löschen, wenn mehrere Nachrichten schnell kommen
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        // Neues Timeout setzen
        scrollTimeoutRef.current = setTimeout(() => {
          // Bestimme die erste neue Nachricht seit dem letzten Zustand
          const firstNewMessageIndex = lastMessageIndexRef.current;
          const messageElements = document.querySelectorAll('.chat-message');
          
          // Überprüfen ob wir Elemente haben und das Element für die erste neue Nachricht existiert
          if (messageElements.length > firstNewMessageIndex) {
            const firstNewElement = messageElements[firstNewMessageIndex];
            
            // Sanft zur ersten neuen Nachricht scrollen
            firstNewElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start'
            });
          }
          
          scrollTimeoutRef.current = null;
        }, 200);
      }
    }
    
    // Aktuelle Nachrichtenanzahl speichern
    lastMessageIndexRef.current = chatHistory.length;
  }, [chatHistory]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!message.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const textToProcess = selectedText && selectedText.trim().length > 0 
        ? selectedText 
        : null;

      const formattedChatHistory = chatHistory.map(msg => 
        `${msg.type === 'assistant' ? 'Assistent: ' : 'Nutzer: '}${msg.content}`
      ).join('\n');
      
      const response = await processClaudeRequest(
        message, 
        textToProcess, 
        chatMode, 
        formattedChatHistory
      );

      // Füge die Nutzernachricht hinzu
      const newChatHistory = [...chatHistory, { type: 'user', content: message }];

      // Verarbeite die Antwort basierend auf dem Typ
      if (response && typeof response === 'object' && response.responseType === 'searchResults' && Array.isArray(response.messages)) {
        // Füge jede Nachricht einzeln zur Chat-Historie hinzu
        response.messages.forEach(msg => {
          if (msg.type === 'answer') {
            newChatHistory.push({ 
              type: 'assistant', 
              content: msg.content 
            });
          } else if (msg.type === 'link') {
            newChatHistory.push({ 
              type: 'assistant', 
              content: msg.title,
              url: msg.url  // URL als separate Eigenschaft speichern
            });
          }
        });
      } else {
        // Standardverarbeitung für Edit/Think-Modus
        newChatHistory.push({ type: 'assistant', content: response });
      }
      
      setChatHistory(newChatHistory);
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
  }, [message, isProcessing, processClaudeRequest, selectedText, chatMode, chatHistory]);

  if (!isEditing) return null;

  return (
    <div className="editor-chat">
      <EditorChatHeader currentMode={chatMode} onModeChange={setChatMode} />
      <div className="editor-chat-messages" ref={chatContainerRef}>
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.type}`}>
            {msg.type === 'assistant' && <TbRobot className="assistant-icon" />}
            {msg.url ? (
              <a href={msg.url} target="_blank" rel="noopener noreferrer">
                {msg.content}
              </a>
            ) : (
              msg.content
            )}
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
          „{selectedText}"
        </div>
      )}
      <form onSubmit={handleSubmit} className="editor-chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            chatMode === 'edit'
              ? (selectedText && selectedText.trim() 
                ? "Textabschnitt anpassen..." 
                : "Ganzen Text anpassen...")
              : chatMode === 'think'
                ? (selectedText && selectedText.trim()
                  ? "Frage zum Textabschnitt..."
                  : "Frage zum Text...")
                : "Suchbegriff eingeben..."
          }
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
