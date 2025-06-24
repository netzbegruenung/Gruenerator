import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { TbRobot, TbMessages } from "react-icons/tb";
import { useClaudeResponse } from './hooks/useClaudeResponse';
import { motion, AnimatePresence } from 'motion/react';
import useCollabEditorStore from '../../../stores/collabEditorStore';
import * as Y from 'yjs';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import TypingIndicator from '../../common/UI/TypingIndicator';
import ReactMarkdown from 'react-markdown';
import { truncateMiddle } from './textTruncation';

const AVAILABLE_COLORS = [
  { name: 'Klee', hex: '#008939' },
  { name: 'Himmel', hex: '#0BA1DD' },
  { name: 'Sonne', hex: '#E6C200' }, // Darker yellow for better contrast with white text
  { name: 'Tanne', hex: '#005538' },
  { name: 'Orange', hex: '#F08C00' }, // Darker Orange
  { name: 'Lila', hex: '#6A0DAD' },    // Darker Purple
  { name: 'Rot', hex: '#D92E20' }     // A red tone
];

const WINE_RED_COLOR = '#8B1538'; // Wine red color for anonymous reviewers

const EditorChat = ({ 
  isEditing, 
  isCollabEditor, 
  isPreviewMode = false,
  // Collaborative editing props (replacing FormContext)
  value = '',
  selectedText = '',
  quillRef = null,
  isAdjusting = false,
  setIsAdjusting = () => {},
  handleAiResponse = null
}) => {
  // debugger; // Removed from here

  const [message, setMessage] = useState('');
  const [chatMode, setChatMode] = useState(isPreviewMode ? 'chat' : 'gruenerator');
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [showNameSelector, setShowNameSelector] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [tempName, setTempName] = useState('');
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [longPressTimeout, setLongPressTimeout] = useState(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  let colorMenuTimeoutRef = useRef(null);
  
  const { yChatHistory, ydoc } = isCollabEditor ? useCollabEditorStore() : { yChatHistory: null, ydoc: null };
  const { user, selectedMessageColor: userPersistentColor, updateUserMessageColor, loading: isLoading } = useOptimizedAuth();

  const [displayedChatHistory, setDisplayedChatHistory] = useState([]);

  // Anonymous user management functions
  const getAnonymousId = useCallback(() => {
    let anonymousId = sessionStorage.getItem('gruenerator_anonymous_id');
    if (!anonymousId) {
      anonymousId = `anonymous-${crypto.randomUUID()}`;
      sessionStorage.setItem('gruenerator_anonymous_id', anonymousId);
    }
    return anonymousId;
  }, []);

  const getReviewerName = useCallback(() => {
    return sessionStorage.getItem('gruenerator_reviewer_name') || 'Anonyme*r Revier*in';
  }, []);

  const setReviewerNameStorage = useCallback((name) => {
    sessionStorage.setItem('gruenerator_reviewer_name', name);
    setReviewerName(name);
  }, []);
  
  const { processClaudeRequest } = useClaudeResponse({
    handleAiResponse: (responseFromClaudeHook) => {
      if (handleAiResponse && responseFromClaudeHook && responseFromClaudeHook.textAdjustment) {
        handleAiResponse(responseFromClaudeHook);
      }
    },
    quillRef,
    value,
    setIsAdjusting,
    setOriginalContent: () => {} // No-op for collaborative editing (Y.js handles history)
  });
  const [isInitialTyping, setIsInitialTyping] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatContainerRef = useRef(null);
  const lastMessageIndexRef = useRef(0);
  const scrollTimeoutRef = useRef(null);

  useEffect(() => {
    const initialMessages = isPreviewMode ? [
      {
        type: 'assistant',
        content: '🔍 Willkommen im Review-Modus! Du befindest dich im Kommentarmodus für dieses Dokument.'
      },
      {
        type: 'assistant',
        content: 'Du kannst Text markieren und Kommentare schreiben. Deine Nachrichten erscheinen in Weinrot, um zu zeigen, dass du als Reviewer aktiv bist.'
      }
    ] : [
      {
        type: 'assistant',
        content: 'Hi!👋 Ich bin dein Grünerator-Assistent. Wähle zwischen "Grünerator"-Modus (KI-Textbearbeitung & Wissensabruf) und "Chat"-Modus (Direktnachrichten mit anderen).'
      },
      {
        type: 'assistant',
        content: 'Im "Grünerator"-Modus kannst du mir Anweisungen zum gesamten Text geben, einen Abschnitt markieren und bearbeiten lassen oder Fragen stellen (ich kann auch im Web suchen!). Im "Chat"-Modus sprichst du direkt mit anderen im Dokument oder zitierst markierten Text.'
      }
    ];

    if (isCollabEditor && yChatHistory && ydoc) {
      ydoc.transact(() => {
        if (yChatHistory.length === 0) {
          initialMessages.forEach(msg => {
            const yMapMsg = new Y.Map();
            Object.entries(msg).forEach(([key, value]) => yMapMsg.set(key, value));
            yChatHistory.push([yMapMsg]);
          });
          setIsInitialTyping(false);
        } else {
          setIsInitialTyping(false);
        }
      }, 'chat-initial');
    } else if (!isCollabEditor) {
      setDisplayedChatHistory([initialMessages[0]]);
      const timer = setTimeout(() => {
        setDisplayedChatHistory(prev => [...prev, initialMessages[1]]);
        setIsInitialTyping(false);
      }, 1500);
      return () => clearTimeout(timer);
    }

    if (isCollabEditor && yChatHistory) {
      const updateLocalChat = () => {
        const newHistory = yChatHistory.toArray().map(yMap => Object.fromEntries(yMap.entries()));
        setDisplayedChatHistory(newHistory);
        if (newHistory.length > initialMessages.length && isInitialTyping) {
            setIsInitialTyping(false); 
        }
      };
      updateLocalChat();
      yChatHistory.observeDeep(updateLocalChat);
      return () => {
        if (yChatHistory && yChatHistory.unobserveDeep) {
           yChatHistory.unobserveDeep(updateLocalChat);
        }
      };
    }
  }, [isCollabEditor, yChatHistory, ydoc]);

  // Effect to handle return after login with pending message
  useEffect(() => {
    if (isPreviewMode && user && !isLoading) {
      // Check if user just logged in and has a pending message
      const pendingMessage = localStorage.getItem('gruenerator_pending_message');
      const returnUrl = localStorage.getItem('gruenerator_return_url');
      
      if (pendingMessage && returnUrl === window.location.href) {
        // Restore the pending message
        setMessage(pendingMessage);
        
        // Clean up stored data
        localStorage.removeItem('gruenerator_pending_message');
        localStorage.removeItem('gruenerator_return_url');
        
        // Optional: Show a welcome back message
        const welcomeBackMessage = {
          type: 'assistant',
          content: '👋 Willkommen zurück! Deine Nachricht wurde wiederhergestellt.',
          timestamp: Date.now()
        };
        
        if (isCollabEditor && yChatHistory && ydoc) {
          ydoc.transact(() => {
            const yMapMsg = new Y.Map();
            Object.entries(welcomeBackMessage).forEach(([key, value]) => yMapMsg.set(key, value));
            yChatHistory.push([yMapMsg]);
          }, 'chat-welcome-back');
        } else {
          setDisplayedChatHistory(prev => [...prev, welcomeBackMessage]);
        }
      }
    }
  }, [isPreviewMode, user, isLoading, isCollabEditor, yChatHistory, ydoc]);

  // Load reviewer name on mount for anonymous users
  useEffect(() => {
    if (isPreviewMode && !user) {
      setReviewerName(getReviewerName());
    }
  }, [isPreviewMode, user, getReviewerName]);

  // Auto-enable review mode for preview links
  useEffect(() => {
    if (isPreviewMode) {
      setIsReviewMode(true);
    }
  }, [isPreviewMode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
      }
    };
  }, [longPressTimeout]);

  const handleNameSubmit = () => {
    if (tempName.trim()) {
      setReviewerNameStorage(tempName.trim());
      setShowNameInput(false);
      setTempName('');
    }
  };

  const handleNameCancel = () => {
    setShowNameInput(false);
    setTempName('');
  };

  useEffect(() => {
    if (displayedChatHistory.length > lastMessageIndexRef.current) {
      const lastMessage = displayedChatHistory[displayedChatHistory.length - 1];
      
      if ((lastMessage.type === 'assistant' || lastMessage.type === 'error' || lastMessage.type === 'user') && displayedChatHistory.length > 2) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        scrollTimeoutRef.current = setTimeout(() => {
          const messageElements = chatContainerRef.current?.querySelectorAll('.chat-message');
          if (messageElements && messageElements.length > 0) {
            const lastElement = messageElements[messageElements.length - 1];
            lastElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end'
            });
          }
          scrollTimeoutRef.current = null;
        }, 350);
      }
    }
    
    lastMessageIndexRef.current = displayedChatHistory.length;
  }, [displayedChatHistory]);

  const handleModeToggle = () => {
    if (isPreviewMode) return; // Disable mode toggle in preview mode
    setChatMode(prevMode => prevMode === 'gruenerator' ? 'chat' : 'gruenerator');
  };

  const handleLongPress = () => {
    setIsReviewMode(prev => !prev);
    setIsLongPressing(false);
  };

  const handleMouseDown = () => {
    setIsLongPressing(true);
    const timeout = setTimeout(() => {
      handleLongPress();
    }, 800);
    setLongPressTimeout(timeout);
  };

  const handleMouseUp = () => {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      setLongPressTimeout(null);
      if (!isLongPressing) {
        // Normal click - toggle chat/gruenerator mode
        handleModeToggle();
      }
    }
    setIsLongPressing(false);
  };

  const handleMouseLeave = () => {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      setLongPressTimeout(null);
    }
    setIsLongPressing(false);
  };

  const handleColorCycle = () => {
    const currentIndex = AVAILABLE_COLORS.findIndex(color => color.hex === userPersistentColor);
    const nextIndex = (currentIndex + 1) % AVAILABLE_COLORS.length;
    updateUserMessageColor(AVAILABLE_COLORS[nextIndex].hex);
  };

  const handleColorSelect = (colorHex) => {
    updateUserMessageColor(colorHex);
    setIsColorMenuOpen(false);
  };

  const openColorMenu = () => {
    clearTimeout(colorMenuTimeoutRef.current);
    setIsColorMenuOpen(true);
  };

  const closeColorMenu = (isImmediate = false) => {
    if (isImmediate) {
      clearTimeout(colorMenuTimeoutRef.current);
      setIsColorMenuOpen(false);
    } else {
      colorMenuTimeoutRef.current = setTimeout(() => {
        setIsColorMenuOpen(false);
      }, 300); // Small delay to allow moving mouse to menu
    }
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    const originalMessage = message; // Capture message before clearing
    setMessage(''); // Clear input field early

    const userMessageContent = chatMode === 'gruenerator' ? `@Grünerator ${originalMessage}` : originalMessage;
    
    // Handle both authenticated and anonymous users
    let userName, userId, isAnonymous, isReviewer;
    if (user) {
      // Authenticated user
      userName = user.user_metadata?.firstName || user.email || 'Benutzer';
      userId = user.id;
      isAnonymous = false;
      isReviewer = isReviewMode;
    } else if (isPreviewMode) {
      // Anonymous user in preview mode
      userName = getReviewerName();
      userId = getAnonymousId();
      isAnonymous = true;
      isReviewer = false;
    } else {
      // Fallback for other cases
      userName = 'Benutzer';
      userId = null;
      isAnonymous = false;
      isReviewer = false;
    }
    
    const commonMessageData = { 
      type: 'user', 
      content: userMessageContent, 
      timestamp: Date.now(), 
      userName,
      userId,
      isAnonymous,
      isReviewer
    };
    
    if (selectedText && selectedText.trim()) {
      commonMessageData.quotedText = truncateMiddle(selectedText.trim(), 150);
    }
    
    // Add user message to displayed chat history (local or Yjs)
    // This happens for both modes if the input is valid.
    // If a subsequent check (like isProcessing or quillRef) fails for Grünerator, 
    // this message is already added, which is generally acceptable.
    if (isCollabEditor && yChatHistory && ydoc) {
      ydoc.transact(() => {
        const yMapMsg = new Y.Map();
        Object.entries(commonMessageData).forEach(([key, value]) => {
          if (value !== undefined) {
            yMapMsg.set(key, value);
          }
        });
        yChatHistory.push([yMapMsg]);
      }, 'chat-message');
    } else {
      setDisplayedChatHistory(prev => [...prev, commonMessageData]);
    }

    if (chatMode === 'chat') {
      if (!isCollabEditor) {
        const soloChatMessage = { type: 'assistant', content: "Der Chat-Modus ist für die direkte Kommunikation im Kollaborationseditor gedacht. Hier gibt es aktuell keine KI-Interaktion, aber du kannst Text markieren und zitieren.", timestamp: Date.now() };
        setDisplayedChatHistory(prev => [...prev, soloChatMessage]);
      }
      return; // Chat mode processing ends here
    }

    // --- Grünerator Mode Specific Logic from here ---
    if (isProcessing) {
      // Optional: Restore message if needed: setMessage(originalMessage);
      return; // Already processing a Grünerator request
    }

    // QuillRef-Prüfung for Grünerator mode
    if (!quillRef || !quillRef.current) {
      console.warn("[EditorChat] Quill editor instance not available for Grünerator mode.");
      const errorMessage = { 
        type: 'error', 
        content: 'Der Editor ist momentan nicht bereit für diese Aktion. Bitte versuchen Sie es später erneut.', 
        timestamp: Date.now() 
      };
      if (isCollabEditor && yChatHistory && ydoc) {
         ydoc.transact(() => {
            const yMapMsg = new Y.Map();
            Object.entries(errorMessage).forEach(([key, value]) => yMapMsg.set(key, value));
            yChatHistory.push([yMapMsg]);
         }, 'chat-error');
      } else {
        setDisplayedChatHistory(prev => [...prev, errorMessage]);
      }
      // Optional: Restore message: setMessage(originalMessage);
      return; 
    }

    setIsProcessing(true);
    let processingMode = 'thinkGlobal';
    const currentSelectedText = selectedText && selectedText.trim().length > 0 ? selectedText.trim() : null;

    // Use originalMessage for search intent detection, as userMessageContent has the prefix
    const messageForSearchCheck = originalMessage.toLowerCase();
    if (currentSelectedText) {
      processingMode = 'editSelected';
    } else if (messageForSearchCheck.startsWith("suche im web nach") || 
               messageForSearchCheck.startsWith("finde informationen über")) {
      processingMode = 'searchExplicit';
    }
    
    try {
      const formattedChatHistoryForClaude = displayedChatHistory
        .filter(msg => msg.type === 'user' || msg.type === 'assistant')
        .map(msg => 
          `${msg.type === 'assistant' ? 'Assistent: ' : (msg.userName ? msg.userName + ': ' : 'Nutzer: ')}${msg.content}`
        ).join('\n');

      const backendResponse = await processClaudeRequest(
        userMessageContent,
        currentSelectedText, 
        processingMode, 
        formattedChatHistoryForClaude
      );
      
      console.log('[EditorChat] Received backendResponse from processClaudeRequest:', JSON.stringify(backendResponse, null, 2)); // Log the full backend response

      if (backendResponse && backendResponse.response) {
        const assistantMessages = Array.isArray(backendResponse.response) 
          ? backendResponse.response 
          : [backendResponse.response];

        for (const contentString of assistantMessages) {
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
          const newAssistantMessage = { 
            type: 'assistant', 
            content: contentString, 
            timestamp: Date.now(),
            isLink: backendResponse.responseType === 'searchResults' && contentString.includes('](')
          };
          if (isCollabEditor && yChatHistory && ydoc) {
            ydoc.transact(() => {
              const yMapMsg = new Y.Map();
              Object.entries(newAssistantMessage).forEach(([key, value]) => yMapMsg.set(key, value));
              yChatHistory.push([yMapMsg]);
            }, 'chat-assistant');
          } else {
            setDisplayedChatHistory(prev => [...prev, newAssistantMessage]);
          }
        }
      } else if (backendResponse && backendResponse.responseType === 'searchResults' && !backendResponse.response) {
        const noResultsMsg = { type: 'assistant', content: "Ich konnte leider keine spezifischen Informationen dazu im Web finden.", timestamp: Date.now() };
        if (isCollabEditor && yChatHistory && ydoc) {
            ydoc.transact(() => {
              const yMapMsg = new Y.Map();
              Object.entries(noResultsMsg).forEach(([key, value]) => yMapMsg.set(key, value));
              yChatHistory.push([yMapMsg]);
            }, 'chat-no-results');
          } else {
            setDisplayedChatHistory(prev => [...prev, noResultsMsg]);
          }
      }

    } catch (error) {
      console.error('[EditorChat] Error in Grünerator handleSubmit:', error);
      const errorMessage = { type: 'error', content: error.message || 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.', timestamp: Date.now() };
      if (isCollabEditor && yChatHistory && ydoc) {
         ydoc.transact(() => {
            const yMapMsg = new Y.Map();
            Object.entries(errorMessage).forEach(([key, value]) => yMapMsg.set(key, value));
            yChatHistory.push([yMapMsg]);
         }, 'chat-error');
      } else {
        setDisplayedChatHistory(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    message, 
    chatMode, 
    isProcessing, 
    processClaudeRequest, 
    selectedText, 
    displayedChatHistory, 
    isCollabEditor, 
    yChatHistory, 
    ydoc, 
    user, 
    handleAiResponse, 
    updateUserMessageColor, 
    userPersistentColor,
    quillRef,
    isPreviewMode,
    isReviewMode,
    getReviewerName,
    getAnonymousId
  ]);

  const renderModeSelector = () => {
    // Hide mode selector in preview mode
    if (isPreviewMode) return null;
    
    const isGrueneratorMode = chatMode === 'gruenerator';
    const IconToShow = isGrueneratorMode ? TbMessages : TbRobot;
    const baseTitle = isGrueneratorMode ? "Zum Chat-Modus wechseln" : "Zum Grünerator-Modus wechseln";
    const title = `${baseTitle} (Lange drücken für Review-Modus)`;

    return (
      <div className="chat-mode-selector">
        <button 
          type="button"
          className={`mode-button ${isReviewMode ? 'review-mode-active' : ''} ${isLongPressing ? 'long-pressing' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          title={title}
          aria-label={title}
        >
          <IconToShow />
          {isReviewMode && <div className="review-mode-indicator"></div>}
        </button>
      </div>
    );
  };

  const renderColorPickerButton = () => {
    return (
      <button
        type="button"
        className="color-picker-button"
        onClick={handleColorCycle}
        onMouseEnter={openColorMenu}
        onMouseLeave={() => closeColorMenu()}
        onFocus={openColorMenu}
        onBlur={() => closeColorMenu()}
        title="Nachrichtenfarbe wechseln"
        aria-label="Nachrichtenfarbe wechseln"
        style={{ backgroundColor: userPersistentColor }}
        aria-haspopup="true"
        aria-expanded={isColorMenuOpen}
      >
        {/* Visual cue, maybe a tiny dot or nothing if the bg is enough */}
      </button>
    );
  }

  const renderColorMenu = () => {
    // Filter out wine red color when in review mode
    const availableColors = isReviewMode 
      ? AVAILABLE_COLORS.filter(color => color.hex !== WINE_RED_COLOR)
      : AVAILABLE_COLORS;

    return (
      <AnimatePresence>
        {isColorMenuOpen && (
          <motion.div
            className="color-picker-menu"
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 500, damping: 30, duration: 0.2 }}
            onMouseEnter={openColorMenu}
            onMouseLeave={() => closeColorMenu(true)}
          >
            {availableColors.map((color) => (
              <motion.button
                key={color.hex}
                type="button"
                className="color-menu-item"
                style={{ backgroundColor: color.hex }}
                onClick={() => handleColorSelect(color.hex)}
                title={color.name}
                aria-label={color.name}
                whileHover={{ scale: 1.15, boxShadow: "0px 0px 8px rgba(0,0,0,0.3)" }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  useEffect(() => {
    if (chatContainerRef.current) {
        const timeoutId = setTimeout(() => {
            if(chatContainerRef.current) {
                const { scrollHeight, clientHeight } = chatContainerRef.current;
                chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
            }
        }, 100);
        return () => clearTimeout(timeoutId);
    }
  }, [displayedChatHistory, isProcessing]);

  if (!isEditing) return null;

  const placeholderText = isPreviewMode 
    ? (selectedText && selectedText.trim() 
        ? "Kommentar zu ausgewähltem Text schreiben..." 
        : "Kommentar oder Frage zum Dokument...")
    : chatMode === 'gruenerator' 
      ? (selectedText && selectedText.trim() 
          ? "Ausgewählten Text anpassen oder dazu fragen..." 
          : "Frage oder Anweisung (z.B. \"suche nach...\")")
      : (isCollabEditor ? "Nachricht an alle oder ausgewählten Text zitieren..." : "Chat-Modus (nur für Kollaboration aktiv)");

  // DEBUGGER PLACEMENT BEFORE RETURN - This debugger should be removed now.
  // debugger;

  return (
    <>
      <div className="editor-chat">
        <div className="editor-chat-messages markdown-styles" ref={chatContainerRef}>
          <AnimatePresence initial={false}>
            {displayedChatHistory.map((msg, index) => {
              let messageStyle = {};
              let messageClasses = `chat-message ${msg.type}`;
              
              if (msg.type === 'user') {
                if (msg.isAnonymous) {
                  // Anonymous user - use wine red styling
                  messageStyle['--user-message-background'] = WINE_RED_COLOR;
                  messageClasses += ' anonymous-reviewer-message';
                } else if (msg.isReviewer) {
                  // Authenticated user in review mode - use wine red styling
                  messageStyle['--user-message-background'] = WINE_RED_COLOR;
                  messageClasses += ' authenticated-reviewer-message';
                } else if (msg.userId && user && msg.userId === user.id) {
                  messageStyle['--user-message-background'] = userPersistentColor;
                } else if (isCollabEditor && msg.userId) {
                  if (msg.userColor) {
                    messageStyle['--user-message-background'] = msg.userColor;
                  } else {
                    messageStyle['--user-message-background'] = '#777777';
                  }
                } else if (!isCollabEditor) {
                  messageStyle['--user-message-background'] = userPersistentColor;
                }
              }

              return (
                <motion.div 
                  key={msg.timestamp || index}
                  className={messageClasses}
                  initial={{ opacity: 0, y: 2, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } }}
                  transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
                  style={messageStyle}
                >
                  {msg.type === 'user' && msg.userName && (
                    <div className="chat-message-user-name">
                      {msg.userName}
                      {(msg.isAnonymous || msg.isReviewer) && (
                        <span className="reviewer-badge">
                          {msg.isAnonymous ? '👁️' : '🔍'}
                        </span>
                      )}
                      {msg.isAnonymous && (
                        <button
                          className="change-name-button"
                          onClick={() => {
                            setTempName(reviewerName === 'Anonyme*r Revier*in' ? '' : reviewerName);
                            setShowNameInput(true);
                          }}
                          title="Name ändern"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  )}
                  {msg.type === 'assistant' && <TbRobot className="assistant-icon" />}
                  
                  {msg.quotedText && (
                    <div className="chat-message-quote">
                      „{msg.quotedText}“
                    </div>
                  )}
                  
                  <ReactMarkdown 
                    components={{
                      // eslint-disable-next-line react/prop-types
                      a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </motion.div>
              );
            })}
            
            {chatMode === 'gruenerator' && isProcessing && (
              <motion.div 
                key="typing-indicator"
                className="chat-message assistant"
                initial={{ opacity: 0, y: 3, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15, ease: "easeOut" } }}
                transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
              >
                <TbRobot className="assistant-icon" />
                <TypingIndicator />
              </motion.div>
            )}
          </AnimatePresence>
          {isInitialTyping && displayedChatHistory.length <= 1 && !isProcessing && (
            <div className="chat-message assistant">
              <TbRobot className="assistant-icon" />
              <ReactMarkdown>...</ReactMarkdown>
            </div>
          )}
        </div>
        
        <div 
          className="floating-input"
          style={{ '--user-accent-color': userPersistentColor }}
        >
          {(selectedText && selectedText.trim()) && (
          <div className="selected-text-display">
            {chatMode === 'gruenerator' ? 'Ausgewählter Text für Grünerator: ' : ''}„{truncateMiddle(selectedText, 70)}“ 
          </div>
        )}
        <div className="input-elements">
          {renderModeSelector()}
          {!isReviewMode && (
            <div className="color-picker-container" onMouseLeave={() => closeColorMenu()} >
              {renderColorPickerButton()}
              {renderColorMenu()}
            </div>
          )}
          <input
            type="text"
            className={`form-input ${isReviewMode ? 'review-mode-input' : ''}`}
            value={chatMode === 'gruenerator' ? `@Grünerator ${message}` : message}
            onChange={(e) => {
              if (chatMode === 'gruenerator') {
                const prefix = "@Grünerator ";
                if (e.target.value.startsWith(prefix)) {
                  setMessage(e.target.value.substring(prefix.length));
                } else {
                  // If user tries to delete the prefix, reset to prefix
                  if (e.target.value.length < prefix.length) {
                    setMessage(''); // Or handle as an invalid input / keep prefix
                  } else {
                     // This case should ideally not happen if prefix is enforced
                    setMessage(e.target.value);
                  }
                }
              } else {
                // Chat mode
                const inputText = e.target.value;
                const triggerGruenerator = "@grünerator";
                const triggerGrueneratorUe = "@gruenerator";

                if (inputText.toLowerCase().startsWith(triggerGruenerator) || 
                    inputText.toLowerCase().startsWith(triggerGrueneratorUe)) {
                  // Check if there's a space after the trigger word or if it's the exact word
                  const remainingTextAfterTrigger = (text, trigger) => text.substring(trigger.length);
                  
                  let switchToGruenerator = false;
                  let textForGruenerator = '';

                  if (inputText.toLowerCase().startsWith(triggerGruenerator)) {
                    const rest = remainingTextAfterTrigger(inputText, triggerGruenerator);
                    if (rest.startsWith(' ') || rest === '') {
                      switchToGruenerator = true;
                      textForGruenerator = rest.trimStart();
                    }
                  }
                  
                  if (!switchToGruenerator && inputText.toLowerCase().startsWith(triggerGrueneratorUe)) {
                    const rest = remainingTextAfterTrigger(inputText, triggerGrueneratorUe);
                    if (rest.startsWith(' ') || rest === '') {
                      switchToGruenerator = true;
                      textForGruenerator = rest.trimStart(); 
                    }
                  }

                  if (switchToGruenerator) {
                    setChatMode('gruenerator');
                    setMessage(textForGruenerator); // Set message to what was typed after the trigger
                  } else {
                    setMessage(inputText);
                  }
                } else {
                  setMessage(inputText);
                }
              }
            }}
            placeholder={placeholderText}
            disabled={(chatMode === 'gruenerator' && isProcessing) || (chatMode === 'chat' && !isCollabEditor && !selectedText)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button 
            type="button"
            onClick={handleSubmit}
            className={isReviewMode ? 'review-mode-button' : ''}
            style={{ backgroundColor: isReviewMode ? WINE_RED_COLOR : userPersistentColor }}
            disabled={!message.trim() || (chatMode === 'gruenerator' && isProcessing) || (chatMode === 'chat' && !isCollabEditor && !selectedText && !message.trim())}
          >
            ➤
          </button>
        </div>
        </div>
      </div>
      
      {/* Name Selection Modal for Anonymous Users */}
      {showNameInput && (
        <div className="name-selector-overlay">
          <div className="name-selector-modal">
            <h3>Namen wählen</h3>
            <p>Wähle einen Namen für deine Kommentare als Reviewer:</p>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Dein Name..."
              className="name-input"
              maxLength={30}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNameSubmit();
                } else if (e.key === 'Escape') {
                  handleNameCancel();
                }
              }}
              autoFocus
            />
            <div className="name-selector-actions">
              <button 
                onClick={handleNameCancel}
                className="name-cancel-button"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleNameSubmit}
                className="name-submit-button"
                disabled={!tempName.trim()}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

EditorChat.propTypes = {
  isEditing: PropTypes.bool.isRequired,
  isCollabEditor: PropTypes.bool,
  isPreviewMode: PropTypes.bool,
  // Collaborative editing props (replacing FormContext)
  value: PropTypes.string,
  selectedText: PropTypes.string,
  quillRef: PropTypes.object,
  isAdjusting: PropTypes.bool,
  setIsAdjusting: PropTypes.func,
  handleAiResponse: PropTypes.func
};

EditorChat.defaultProps = {
  isCollabEditor: false,
  isPreviewMode: false,
  value: '',
  selectedText: '',
  quillRef: null,
  isAdjusting: false,
  setIsAdjusting: () => {},
  handleAiResponse: null
};

export default EditorChat;
