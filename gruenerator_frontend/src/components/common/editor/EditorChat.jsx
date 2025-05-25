import React, { useState, useCallback, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import { TbRobot } from "react-icons/tb";
import { TbPencil, TbBrain, TbSearch, TbMessageCircle } from "react-icons/tb";
import { useClaudeResponse } from './hooks/useClaudeResponse';
import EditorChatHeader from './EditorChatHeader';
import { motion, AnimatePresence } from 'motion/react';


const EditorChat = ({ isEditing, isCollabEditor }) => {
  const [message, setMessage] = useState('');
  const [chatMode, setChatMode] = useState('edit');
  const [showFullModeSelector, setShowFullModeSelector] = useState(false);
  const modeHoverTimeoutRef = useRef(null);
  const [isChatActive, setIsChatActive] = useState(false);
  const { 
    value, 
    selectedText, 
    handleAiResponse, 
    quillRef, 
    setOriginalContent, 
    setIsAdjusting 
  } = useContext(FormContext);
  
  console.log('[EditorChat] selectedText from FormContext:', selectedText);
  
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

  // Event-Handler für Responsive Layout (Fenstergrößenänderungen)
  useEffect(() => {
    const handleResize = () => {
      // Bei Desktop-Ansicht den Chat immer anzeigen
      if (window.innerWidth > 768) {
        setIsChatActive(false);
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Initial ausführen
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleChat = () => {
    setIsChatActive(!isChatActive);
  };

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

  // Log attempts to access quillRef (example, adapt if used elsewhere)
  useEffect(() => {
    if (quillRef?.current) {
    } else {
    }
  }, [quillRef]);

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

  // Funktion, um zum nächsten Modus zu wechseln
  const switchToNextMode = useCallback(() => {
    const modes = ['edit', 'think', 'search'];
    const currentIndex = modes.indexOf(chatMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setChatMode(modes[nextIndex]);
  }, [chatMode]);

  // Handler für Hover auf dem Mode-Button
  const handleModeButtonMouseEnter = useCallback(() => {
    if (isCollabEditor) {
      // Wenn ein Timeout zum Ausblenden läuft, dieses löschen
      if (modeHoverTimeoutRef.current) {
        clearTimeout(modeHoverTimeoutRef.current);
        modeHoverTimeoutRef.current = null;
      }
      
      // Sofort anzeigen, wenn wir bereits drin waren und nur kurz raus
      if (showFullModeSelector) {
        return;
      }
      
      // Sonst mit Verzögerung anzeigen
      modeHoverTimeoutRef.current = setTimeout(() => {
        setShowFullModeSelector(true);
      }, 600); // 600ms Verzögerung vor dem Öffnen
    }
  }, [isCollabEditor, showFullModeSelector]);

  const handleModeButtonMouseLeave = useCallback(() => {
    if (modeHoverTimeoutRef.current) {
      clearTimeout(modeHoverTimeoutRef.current);
    }
    
    // Verzögerung beim Ausblenden hinzufügen, um dem Nutzer Zeit zu geben,
    // den erweiterten Selektor zu erreichen
    modeHoverTimeoutRef.current = setTimeout(() => {
      setShowFullModeSelector(false);
    }, 300); // 300ms Verzögerung vor dem Schließen
  }, []);
  
  // Handler für den erweiterten Selektor
  const handleExtendedSelectorMouseEnter = useCallback(() => {
    // Timeout löschen, wenn wir den erweiterten Bereich erreicht haben
    if (modeHoverTimeoutRef.current) {
      clearTimeout(modeHoverTimeoutRef.current);
      modeHoverTimeoutRef.current = null;
    }
  }, []);
  
  const handleExtendedSelectorMouseLeave = useCallback(() => {
    // Mit Verzögerung ausblenden, wenn wir den erweiterten Bereich verlassen
    modeHoverTimeoutRef.current = setTimeout(() => {
      setShowFullModeSelector(false);
    }, 300); // 300ms Verzögerung vor dem Schließen
  }, []);

  // Aktualisierte renderModeSelector-Funktion
  const renderModeSelector = () => {
    if (!isCollabEditor) {
      // Original-Selektor für nicht-Collab-Editor
      return (
        <div className="chat-mode-selector">
          <button 
            className={`mode-button ${chatMode === 'edit' ? 'active' : ''}`}
            onClick={() => setChatMode('edit')}
            title="Edit-Modus"
          >
            <TbPencil />
          </button>
          <button 
            className={`mode-button ${chatMode === 'think' ? 'active' : ''}`}
            onClick={() => setChatMode('think')}
            title="Think-Modus"
          >
            <TbBrain />
          </button>
          <button 
            className={`mode-button ${chatMode === 'search' ? 'active' : ''}`}
            onClick={() => setChatMode('search')}
            title="Such-Modus"
          >
            <TbSearch />
          </button>
        </div>
      );
    }

    // Neuer Modus-Selektor für Collab-Editor
    const currentModeIcon = chatMode === 'edit' ? <TbPencil /> : chatMode === 'think' ? <TbBrain /> : <TbSearch />;
    const currentModeTitle = chatMode === 'edit' ? 'Edit-Modus' : chatMode === 'think' ? 'Think-Modus' : 'Such-Modus';

    return (
      <div 
        className="chat-mode-selector collapsed"
        onMouseEnter={handleModeButtonMouseEnter}
        onMouseLeave={handleModeButtonMouseLeave}
      >
        <motion.button 
          className={`mode-button active`}
          onClick={switchToNextMode}
          title={currentModeTitle}
          aria-label={`Aktueller Modus: ${currentModeTitle}. Klicken, um zum nächsten Modus zu wechseln.`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {currentModeIcon}
        </motion.button>

        <AnimatePresence>
          {showFullModeSelector && (
            <motion.div 
              className="extended-mode-selector"
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
              onMouseEnter={handleExtendedSelectorMouseEnter}
              onMouseLeave={handleExtendedSelectorMouseLeave}
            >
              {chatMode !== 'edit' && (
                <motion.button 
                  className="mode-button"
                  onClick={() => setChatMode('edit')}
                  title="Edit-Modus"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.1, delay: 0.05 }}
                >
                  <TbPencil />
                </motion.button>
              )}
              {chatMode !== 'think' && (
                <motion.button 
                  className="mode-button"
                  onClick={() => setChatMode('think')}
                  title="Think-Modus"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.1, delay: 0.1 }}
                >
                  <TbBrain />
                </motion.button>
              )}
              {chatMode !== 'search' && (
                <motion.button 
                  className="mode-button"
                  onClick={() => setChatMode('search')}
                  title="Such-Modus"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.1, delay: 0.15 }}
                >
                  <TbSearch />
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (!isEditing) return null;

  return (
    <>
      <div className={`editor-chat ${isChatActive ? 'active' : ''}`}>
        {!isCollabEditor && (
          <EditorChatHeader currentMode={chatMode} onModeChange={setChatMode} isCollabEditor={isCollabEditor} />
        )}
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
              <span>...</span>
            </div>
          )}
        </div>
        {selectedText && selectedText.trim() && (
          <div className="selected-text-display">
            „{selectedText}"
          </div>
        )}
        <form onSubmit={handleSubmit} className="editor-chat-input">
          {isCollabEditor ? renderModeSelector() : null}
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
              <span>...</span>
            ) : '➤'}
          </button>
        </form>
      </div>

      <button 
        className="chat-toggle-button" 
        onClick={toggleChat}
        aria-label="Chat öffnen/schließen"
      >
        <TbMessageCircle />
      </button>
    </>
  );
};

EditorChat.propTypes = {
  isEditing: PropTypes.bool.isRequired,
  isCollabEditor: PropTypes.bool
};

EditorChat.defaultProps = {
  isCollabEditor: false
};

export default EditorChat;
