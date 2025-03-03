import React, { useContext, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ReactQuill from 'react-quill';
import { EditorToolbar } from './EditorToolbar';
import 'react-quill/dist/quill.snow.css';
import { FormContext } from '../utils/FormContext';
import { applyHighlightWithAnimation } from '../utils/highlightUtils';
import { enableMobileEditorScrolling } from '../utils/mobileEditorScrolling';

const QuillWrapper = React.forwardRef((props, ref) => (
  <ReactQuill
    {...props}
    ref={ref}
  />
));

QuillWrapper.displayName = 'QuillWrapper';

const PROTECTED_HEADERS = [
  'TWITTER:',
  'FACEBOOK:',
  'INSTAGRAM:',
  'LINKEDIN:',
  'AKTIONSIDEEN:',
  'INSTAGRAM REEL:'
];

const Editor = React.memo(({ setEditorInstance = () => {} }) => {
  const {
    value,
    updateValue,
    isEditing,
    isAdjusting,
    activePlatform,
    facebookValue,
    instagramValue,
    twitterValue,
    linkedinValue,
    reelScriptValue,
    actionIdeasValue,
    handleAiAdjustment,
    handleAcceptAdjustment,
    handleRejectAdjustment,
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    adjustText,
    error,
    newSelectedText,
    removeAllHighlights,
    originalContent,
    setOriginalContent,
    setIsApplyingAdjustment,
  } = useContext(FormContext);

  console.log('[Editor] isEditing Status:', isEditing);
  console.log('[Editor] isAdjusting Status:', isAdjusting);
  console.log('[Editor] activePlatform:', activePlatform);
  console.log('[Editor] value:', value);
  console.log('[Editor] value Typ:', typeof value);
  console.log('[Editor] value Länge:', value ? value.length : 0);

  const quillRef = useRef(null);
  const prevLocalValue = useRef('');
  const [localValue, setLocalValue] = useState(value);
  const [showAdjustButton, setShowAdjustButton] = useState(false);
  const isTouchDevice = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const isProgrammaticChange = useRef(false);

  useEffect(() => {
    if (activePlatform) {
      const platformContent = {
        facebook: facebookValue,
        instagram: instagramValue,
        twitter: twitterValue,
        linkedin: linkedinValue,
        reelScript: reelScriptValue,
        actionIdeas: actionIdeasValue
      }[activePlatform] || '';
      setLocalValue(platformContent);
    } else {
      setLocalValue(value);
    }
  }, [
    value, 
    activePlatform, 
    facebookValue,
    instagramValue,
    twitterValue,
    linkedinValue,
    reelScriptValue,
    actionIdeasValue
  ]);

  const handleChange = useCallback((content, source) => {
    console.log('[Editor] Content Change:', { source, isEditing, content: content.substring(0, 100) + '...' });
    setLocalValue(content);
    if (isEditing && source === 'user') {
      updateValue(content);
    }
  }, [isEditing, updateValue]);

  const setEditorContent = useCallback((content, format = 'html') => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      isProgrammaticChange.current = true;
      try {
        if (format === 'html') {
          editor.root.innerHTML = content;
        } else {
          editor.setText(content);
        }
        setLocalValue(content);
        if (activePlatform) {
          updateValue(content);
        }
      } catch (error) {
        editor.setText(content);
      } finally {
        isProgrammaticChange.current = false;
      }
    }
  }, [activePlatform, updateValue]);

  useEffect(() => {
    if (setEditorInstance) {
      setEditorInstance({
        setContent: setEditorContent,
        getHtmlContent: () => quillRef.current?.root.innerHTML,
        getDelta: () => quillRef.current?.getEditor().getContents(),
        focus: () => quillRef.current?.getEditor().focus(),
      });
    }
  }, [setEditorInstance, setEditorContent]);

  const handleSelection = useCallback((range) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    if (range && range.length > 0 && !isAdjusting) {
      const text = editor.getText(range.index, range.length);
      setSelectedText(text);
      setHighlightedRange(range);
      setShowAdjustButton(true);
      setOriginalContent(editor.root.innerHTML);

      if (!isTouchDevice) {
        applyHighlightWithAnimation(editor, range.index, range.length);
      }
    } else if (!isAdjusting) {
      setSelectedText('');
      setHighlightedRange(null);
      setShowAdjustButton(false);
      removeAllHighlights(editor);
    }
  }, [isAdjusting, isTouchDevice, setSelectedText, setHighlightedRange, setShowAdjustButton, setOriginalContent, removeAllHighlights]);

  const handleSelectionChange = useCallback((range) => {
    handleSelection(range);
  }, [handleSelection]);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      editor.on('selection-change', handleSelectionChange);
      return () => {
        editor.off('selection-change', handleSelectionChange);
      };
    }
  }, [handleSelectionChange]);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (editor && isTouchDevice) {
      const handleTouchEnd = () => {
        const range = editor.getSelection();
        if (range && range.length > 0) {
          handleSelection(range);
          applyHighlightWithAnimation(editor, range.index, range.length);
        } else {
          setSelectedText('');
          setHighlightedRange(null);
          setShowAdjustButton(false);
          removeAllHighlights(editor);
        }
      };
      editor.root.addEventListener('touchend', handleTouchEnd);
      return () => {
        editor.root.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [
    applyHighlightWithAnimation, 
    isTouchDevice, 
    handleSelection, 
    setSelectedText, 
    setHighlightedRange, 
    setShowAdjustButton, 
    removeAllHighlights
  ]);

  const formats = useMemo(() => [
    'header', 'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent', 'link', 'image', 'code-block',
    'script', 'align', 'color', 'background', 'clean', 'protected'
  ], []);

  const modules = useMemo(() => ({
    toolbar: {
      container: '#toolbar',
      handlers: {
        undo: function() { this.quill.history.undo(); },
        redo: function() { this.quill.history.redo(); },
      },
    },
    clipboard: { matchVisual: true },
    history: { delay: 1000, maxStack: 100, userOnly: true },
  }), []);

  useEffect(() => {
    if (quillRef.current) {
      try {
        const quill = quillRef.current.getEditor();
        console.log('[Editor] Aktiviere/Deaktiviere Editor:', { isEditing, isAdjusting, enabled: isEditing && !isAdjusting });
        quill.enable(isEditing && !isAdjusting);
      } catch (error) {
        console.error('[Editor] Fehler beim Aktivieren/Deaktivieren des Editors:', error);
      }
    }
  }, [isEditing, isAdjusting]);

  // Verwenden der externen Funktion für mobiles Scrolling
  useEffect(() => {
    // Die Funktion gibt eine Cleanup-Funktion zurück, die React automatisch aufruft
    return enableMobileEditorScrolling(quillRef, isEditing);
  }, [isEditing, quillRef]);

  const applyAdjustment = useCallback((newText, keepFormatting = true) => {
    const quill = quillRef.current?.getEditor();
    if (quill && highlightedRange) {
      quill.deleteText(highlightedRange.index, highlightedRange.length);
      quill.insertText(highlightedRange.index, newText, keepFormatting ? {
        'color': '#000000',
        'background': '#e6ffe6'
      } : {});
      quill.setSelection(highlightedRange.index + newText.length, 0);
      const updatedContent = quill.root.innerHTML;
      setLocalValue(updatedContent);
      updateValue(updatedContent);
    }
  }, [highlightedRange, updateValue]);

  useEffect(() => {
    if (newSelectedText && highlightedRange) {
      applyAdjustment(newSelectedText);
    }
  }, [newSelectedText, highlightedRange, applyAdjustment]);

  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      let lastProtectedHeaders = {};
      
      // Initial geschützte Header speichern
      const text = quill.getText();
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        PROTECTED_HEADERS.forEach(header => {
          if (line.trim().toUpperCase() === header) {
            lastProtectedHeaders[index] = line;
          }
        });
      });
      
      quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user') {
          const currentText = quill.getText();
          const currentLines = currentText.split('\n');
          let offset = 0;
          let hasHeaderChanges = false;
          let contentChanged = false;
          
          // Sammle alle existierenden Header
          const existingHeaders = new Set();
          currentLines.forEach(line => {
            PROTECTED_HEADERS.forEach(header => {
              if (line.trim().toUpperCase() === header) {
                existingHeaders.add(header);
              }
            });
          });
          
          // Für jede Zeile prüfen
          currentLines.forEach((line, index) => {
            // Prüfen ob diese Zeile ein geschützter Header war
            if (lastProtectedHeaders[index]) {
              const originalHeader = lastProtectedHeaders[index];
              // Nur wiederherstellen wenn der Header nicht schon existiert
              if (line.trim().toUpperCase() !== originalHeader.trim().toUpperCase() && 
                  !existingHeaders.has(originalHeader.trim().toUpperCase())) {
                // Nur den Header wiederherstellen
                const start = offset;
                hasHeaderChanges = true;
                
                // Header wiederherstellen
                quill.deleteText(start, line.length);
                quill.insertText(start, originalHeader, {
                  'color': '#000000',
                  'background': '#f0f0f0'
                });
                existingHeaders.add(originalHeader.trim().toUpperCase());
              }
            }
            
            // Offset für nächste Zeile aktualisieren
            offset += line.length + 1; // +1 für den Zeilenumbruch
          });
          
          const newContent = quill.root.innerHTML;
          contentChanged = newContent !== localValue;
          
          // Nur aktualisieren wenn Header geändert wurden oder der Inhalt sich wirklich geändert hat
          if (hasHeaderChanges || contentChanged) {
            // Neue geschützte Header speichern
            const newHeaders = {};
            const newLines = quill.getText().split('\n');
            let hasValidContent = false;
            
            // Entferne doppelte Header
            const seenHeaders = new Set();
            newLines.forEach((line, index) => {
              PROTECTED_HEADERS.forEach(header => {
                if (line.trim().toUpperCase() === header) {
                  if (!seenHeaders.has(header)) {
                    newHeaders[index] = line;
                    seenHeaders.add(header);
                  } else {
                    // Lösche doppelte Header
                    const start = offset;
                    quill.deleteText(start, line.length + 1);
                    hasHeaderChanges = true;
                  }
                } else if (line.trim().length > 0) {
                  hasValidContent = true;
                }
              });
            });
            
            // Nur aktualisieren wenn es gültigen Inhalt gibt
            if (hasValidContent) {
              lastProtectedHeaders = newHeaders;
              const finalContent = quill.root.innerHTML;
              if (finalContent !== localValue) {
                setLocalValue(finalContent);
                updateValue(finalContent);
              }
            }
          }
        }
      });
    }
  }, [updateValue]);

  // Modifiziere den Platform-Container Wiederherstellungs-Effect
  useEffect(() => {
    if (!isEditing && localValue) {
      const containsPlatformHeaders = PROTECTED_HEADERS.some(header => 
        localValue.toUpperCase().includes(header)
      );
      
      if (containsPlatformHeaders && localValue !== prevLocalValue.current) {
        prevLocalValue.current = localValue;
        // Prüfe ob der Inhalt nicht leer ist
        const textContent = localValue.replace(/<[^>]*>/g, '').trim();
        if (textContent.length > 0) {
          setLocalValue(localValue);
          updateValue(localValue);
        }
      }
    }
  }, [isEditing, localValue, updateValue]);

  const handleAiAdjustmentLocal = useCallback((adjustmentOrState, text) => {
    if (typeof adjustmentOrState === 'boolean') {
      handleAiAdjustment(adjustmentOrState, text);
    } else if (typeof adjustmentOrState === 'string') {
      const quill = quillRef.current?.getEditor();
      if (quill && highlightedRange) {
        quill.deleteText(highlightedRange.index, highlightedRange.length);
        quill.insertText(highlightedRange.index, adjustmentOrState, {
          'color': '#000000',
          'background': '#ffff99'
        });
        setLocalValue(quill.root.innerHTML);
      }
      handleAiAdjustment(true, adjustmentOrState);
    }
  }, [handleAiAdjustment, highlightedRange]);

  const onConfirmAdjustment = useCallback(() => {
    if (newSelectedText) {
      const quill = quillRef.current?.getEditor();
      if (quill) {
        setIsApplyingAdjustment(true);
        if (highlightedRange) {
          quill.formatText(highlightedRange.index, newSelectedText.length, {
            'background': '#e6ffe6'
          });
        } else {
          const length = quill.getLength();
          quill.insertText(length, newSelectedText, {
            'color': '#000000',
            'background': '#e6ffe6'
          });
        }
        handleAcceptAdjustment();
        setHighlightedRange(null);
        setSelectedText('');
        handleAiAdjustment(false);
      }
    }
  }, [applyAdjustment, handleAcceptAdjustment, newSelectedText, highlightedRange, setHighlightedRange, setSelectedText, handleAiAdjustment]);

  return (
    <div className="text-editor">
      <EditorToolbar
        readOnly={!isEditing}
        onAdjustText={adjustText}
        isAdjusting={isAdjusting}
        onConfirmAdjustment={onConfirmAdjustment}
        onAiAdjustment={handleAiAdjustmentLocal}
        showAdjustButton={showAdjustButton}
        selectedText={selectedText}
        originalSelectedText={selectedText}
        newSelectedText={newSelectedText}
        onRejectAdjustment={handleRejectAdjustment}
        isEditing={isEditing}
        showConfirmation={!!newSelectedText}
        removeAllHighlights={removeAllHighlights}
        originalContent={originalContent}
      />
      <QuillWrapper
        ref={quillRef}
        value={localValue}
        onChange={handleChange}
        onChangeSelection={handleSelectionChange}
        modules={modules}
        formats={formats}
        readOnly={!isEditing || isAdjusting}
        theme="snow"
        placeholder={isEditing ? 'Start writing...' : ''}
        preserveWhitespace={true}
        scrollingContainer="html"
      />
      {error && <p className="error-message">Error: {error}</p>}
    </div>
  );
});

Editor.propTypes = {
  setEditorInstance: PropTypes.func,
};

Editor.displayName = 'Editor';

export default React.memo(Editor);
