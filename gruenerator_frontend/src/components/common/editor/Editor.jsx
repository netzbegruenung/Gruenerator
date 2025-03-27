import React, { useContext, useEffect, useRef, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import ReactQuill from 'react-quill';

import { EditorToolbar } from './EditorToolbar';
import 'react-quill/dist/quill.snow.css';
import { FormContext } from '../../utils/FormContext';
import { enableMobileEditorScrolling } from '../../utils/mobileEditorScrolling';
import { 
  useTextHighlighting, 
  useQuillEditor, 
  useProtectedHeaders 
} from './hooks';

const QuillWrapper = React.forwardRef((props, ref) => (
  <ReactQuill
    {...props}
    ref={ref}
  />
));

QuillWrapper.displayName = 'QuillWrapper';

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
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    adjustText,
    error,
    adjustmentText,
    removeAllHighlights,
    originalContent,
    setOriginalContent,
    setIsApplyingAdjustment,
    aiAdjustment,
    setIsAdjusting,
    setAdjustmentText,
    setAiAdjustment
  } = useContext(FormContext);

  const quillRef = useRef(null);
  const [localValue, setLocalValue] = useState(value);
  const [showAdjustButton, setShowAdjustButton] = useState(false);
  const isTouchDevice = useCallback(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, [])();

  // Hooks verwenden
  const highlighting = useTextHighlighting(
    quillRef, 
    setSelectedText, 
    setHighlightedRange, 
    setOriginalContent, 
    isAdjusting
  );

  const { 
    formats, 
    modules, 
    handleChange, 
    setEditorContent, 
    getEditorInterface 
  } = useQuillEditor(
    quillRef, 
    updateValue, 
    setLocalValue, 
    isEditing, 
    isAdjusting
  );

  // Direkte Integration von useTextAdjustment Funktionen
  const applyAdjustment = useCallback((newText) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    console.log('[useTextAdjustment] applyAdjustment', {
      newTextLength: newText?.length,
      hasHighlightedRange: !!highlightedRange
    });
    
    if (highlightedRange) {
      console.log('[useTextAdjustment] Wende selected-type Anpassung an', {
        newTextLength: newText.length,
        highlightedRange
      });
      
      // Markierten Text durch neuen Text ersetzen
      quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
      quill.insertText(highlightedRange.index, newText, 'api');
      
      // Neue Zeile: Wende die grüne Hervorhebung auf den neuen Text an
      highlighting.applyNewTextHighlight(quill, highlightedRange.index, newText.length);
      
      // Lokalen Wert aktualisieren
      setLocalValue(quill.root.innerHTML);
    } else {
      // Wenn kein markierter Bereich, dann alle Hervorhebungen entfernen
      highlighting.removeAllHighlights(quill);
      setLocalValue(quill.root.innerHTML);
    }
  }, [quillRef, highlightedRange, highlighting.applyNewTextHighlight, highlighting.removeAllHighlights, setLocalValue]);

  const rejectAdjustment = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    
    console.log('[TextAdjustment] Adjustment rejected');
    console.log('[TextAdjustment] Type:', aiAdjustment?.type, 'Range:', !!highlightedRange);
    
    // Prüfe zuerst direkt auf den Typ, unabhängig von anderen Bedingungen
    if (aiAdjustment?.type === 'full' && quill) {
      console.log('[TextAdjustment] Verarbeite full type rejection');
      const div = document.createElement('div');
      div.innerHTML = originalContent;
      quill.setText(div.textContent || '');
      updateValue(quill.root.innerHTML);
    } else if (highlightedRange && quill) {
      console.log('[TextAdjustment] Verarbeite selected type rejection');
      quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
      
      if (originalContent) {
        quill.insertText(highlightedRange.index, originalContent, 'api');
        setLocalValue(quill.root.innerHTML);
      }
    } else {
      console.warn('[TextAdjustment] Konnte weder full noch selected type verarbeiten');
    }
    
    // States immer zurücksetzen
    setIsAdjusting(false);
    setAdjustmentText('');
    setOriginalContent('');
    setAiAdjustment(null);
    highlighting.removeAllHighlights();
    
    console.log('[useTextAdjustment] rejectAdjustment abgeschlossen');
  }, [
    originalContent, 
    updateValue, 
    quillRef, 
    aiAdjustment?.type, 
    highlightedRange,
    setIsAdjusting,
    setAdjustmentText,
    setOriginalContent,
    setAiAdjustment,
    highlighting.removeAllHighlights
  ]);

  // Effekt für die Anwendung von Anpassungen (aus useTextAdjustment)
  useEffect(() => {
    if (adjustmentText) {
      if (highlightedRange) {
        applyAdjustment(adjustmentText);
      } else if (aiAdjustment?.type === 'full') {
        const quill = quillRef.current?.getEditor();
        if (quill) {
          quill.setText(adjustmentText);
          highlighting.applyNewTextHighlight(quill, 0, adjustmentText.length);
          setLocalValue(quill.root.innerHTML);
        }
      }
      // Direkt zurücksetzen nach Anwendung
      setIsAdjusting(false);
      setAdjustmentText('');
      setAiAdjustment(null);
    }
  }, [adjustmentText, highlightedRange, aiAdjustment]);

  // Geschützte Headers
  useProtectedHeaders(quillRef, updateValue, localValue, setLocalValue, isEditing);

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

  useEffect(() => {
    setEditorInstance(getEditorInterface());
  }, [setEditorInstance, getEditorInterface]);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      editor.on('selection-change', highlighting.handleSelectionChange);
      return () => {
        editor.off('selection-change', highlighting.handleSelectionChange);
      };
    }
  }, [highlighting.handleSelectionChange]);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (editor && isTouchDevice) {
      const handleTouchEnd = () => {
        const range = editor.getSelection();
        if (range && range.length > 0) {
          highlighting.handleSelection(range);
          highlighting.applyHighlightWithAnimation(editor, range.index, range.length);
        } else if (range?.length === 0) {
          setSelectedText('');
          setHighlightedRange(null);
          highlighting.removeAllHighlights(editor);
        }
      };
      editor.root.addEventListener('touchend', handleTouchEnd);
      return () => {
        editor.root.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [
    highlighting,
    isTouchDevice,
    setSelectedText,
    setHighlightedRange
  ]);

  // Verwenden der externen Funktion für mobiles Scrolling
  useEffect(() => {
    // Die Funktion gibt eine Cleanup-Funktion zurück, die React automatisch aufruft
    return enableMobileEditorScrolling(quillRef, isEditing);
  }, [isEditing]);

  return (
    <div className="text-editor">
      <EditorToolbar
        readOnly={!isEditing}
        onAdjustText={adjustText}
        isAdjusting={isAdjusting}
        showAdjustButton={showAdjustButton}
        selectedText={selectedText}
        isEditing={isEditing}
        removeAllHighlights={highlighting.removeAllHighlights}
        originalContent={originalContent}
      />
      <QuillWrapper
        ref={quillRef}
        value={localValue}
        onChange={handleChange}
        onChangeSelection={highlighting.handleSelectionChange}
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
