import React, { useContext, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ReactQuill from 'react-quill';
import { EditorToolbar } from './EditorToolbar';
import 'react-quill/dist/quill.snow.css';
import '../../assets/styles/components/quill-custom.css';
import '../../assets/styles/components/editor.css';
import { FormContext } from '../utils/FormContext';
import { applyHighlightWithAnimation } from '../utils/highlightUtils';
//import { useDebouncedCallback } from 'use-debounce';

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
//   applyAdjustmentToEditor,
    removeAllHighlights,
    originalContent,
    setOriginalContent,
    setIsApplyingAdjustment,

  } = useContext(FormContext);

  const quillRef = useRef(null);
  const [localValue, setLocalValue] = useState(value);
  const [showAdjustButton, setShowAdjustButton] = useState(false);
  const isTouchDevice = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const isProgrammaticChange = useRef(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((content, source) => {
    console.log('handleChange called', { content, source, isEditing });
    setLocalValue(content);
    if (isEditing && source === 'user') {
      updateValue(content);
    }
  }, [isEditing, updateValue]);

  const setEditorContent = useCallback((content, format = 'html') => {
    console.log('Editor-Inhalt wird aktualisiert:', { format, contentLength: content.length });
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
        console.log('Editor-Inhalt erfolgreich aktualisiert');
      } catch (error) {
        console.error('Fehler beim Setzen des Editor-Inhalts:', error);
        editor.setText(content);
      } finally {
        isProgrammaticChange.current = false;
      }
    }
  }, []);

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
    console.log('handleSelection called', { range, isAdjusting });
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
  
    if (range && range.length > 0 && !isAdjusting) {
      const text = editor.getText(range.index, range.length);
      setSelectedText(text);
      setHighlightedRange(range);
      setShowAdjustButton(true);
      setOriginalContent(editor.root.innerHTML);
  
      // Only apply highlight on non-touch devices
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
  
  // const debouncedHandleSelection = useDebouncedCallback(
  //   (range) => {
  //     handleSelection(range);
  //   },
  //   200
  // );

  const handleSelectionChange = useCallback((range) => {
    console.log('handleSelectionChange called', { range });
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
          handleSelection(range); // Setzt highlightedRange und selectedText
          applyHighlightWithAnimation(editor, range.index, range.length);
        } else {
          // Wenn keine Auswahl vorhanden ist, Rücksetzen der Auswahlzustände
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
    'script', 'align', 'color', 'background', 'clean'
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
        console.log('Updating editor state', { isEditing, isAdjusting });
        quill.enable(isEditing && !isAdjusting);
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Editor-Zustands:', error);
      }
    }
  }, [isEditing, isAdjusting]);

  useEffect(() => {
    console.log('Editor: isAdjusting changed:', isAdjusting);
  }, [isAdjusting]);

  const applyAdjustment = useCallback((newText, keepFormatting = true) => {
    console.log('applyAdjustment aufgerufen', { newText, highlightedRange, keepFormatting });
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
    } else {
      console.error('Quill-Editor oder highlightedRange nicht verfügbar');
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
      quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user') {
          setLocalValue(quill.root.innerHTML);
          updateValue(quill.root.innerHTML);
        }
      });
    }
  }, [updateValue]);

  const handleAiAdjustmentLocal = useCallback((adjustmentOrState, text) => {
    if (typeof adjustmentOrState === 'boolean') {
      handleAiAdjustment(adjustmentOrState, text);
    } else if (typeof adjustmentOrState === 'string') {
      // Wenn ein neuer Text vorgeschlagen wird, aktualisieren wir den Editor
      const quill = quillRef.current?.getEditor();
      if (quill && highlightedRange) {
        quill.deleteText(highlightedRange.index, highlightedRange.length);
        quill.insertText(highlightedRange.index, adjustmentOrState, {
          'color': '#000000',
          'background': '#ffff99' // Gelbe Hintergrundfarbe für den vorgeschlagenen Text
        });
        setLocalValue(quill.root.innerHTML);
      }
      handleAiAdjustment(true, adjustmentOrState);
    }
  }, [handleAiAdjustment, highlightedRange]);

  const onConfirmAdjustment = useCallback(() => {
    console.log('onConfirmAdjustment aufgerufen', { newSelectedText, highlightedRange });
    if (newSelectedText) {
      const quill = quillRef.current?.getEditor();
      if (quill) {
        setIsApplyingAdjustment(true);
        if (highlightedRange) {
          // Der Text wurde bereits eingefügt, wir müssen nur die Formatierung anpassen
          quill.formatText(highlightedRange.index, newSelectedText.length, {
            'background': '#e6ffe6' // Hellgrüne Hintergrundfarbe für den akzeptierten Text
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
      } else {
        console.error('Quill-Editor nicht verfügbar');
      }
    } else {
      console.error('Kein neuer Text zum Anwenden verfügbar');
    }
  }, [applyAdjustment, handleAcceptAdjustment, newSelectedText, highlightedRange, setHighlightedRange, setSelectedText, handleAiAdjustment]);

  return (
    <div className="text-editor">
      <EditorToolbar
        readOnly={!isEditing}
        onAdjustText={adjustText}
        isAdjusting={isAdjusting}
        onConfirmAdjustment={onConfirmAdjustment}
        highlightedRange={highlightedRange}
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
