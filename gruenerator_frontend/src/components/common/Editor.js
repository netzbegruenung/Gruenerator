import React, { useContext, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ReactQuill from 'react-quill';
import { EditorToolbar } from './EditorToolbar';
import 'react-quill/dist/quill.snow.css';
import '../../assets/styles/components/quill-custom.css';
import '../../assets/styles/components/editor.css';
import { FormContext } from '../utils/FormContext';

const Editor = React.memo(({ setEditorInstance }) => {
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
    setQuillRef,
    applyAdjustmentToEditor,
    removeAllHighlights,
    originalContent,
    setOriginalContent,
  } = useContext(FormContext);

  const quillRef = useRef(null);
  const [localValue, setLocalValue] = useState(value);
  const [showAdjustButton, setShowAdjustButton] = useState(false);

  const isProgrammaticChange = useRef(false);
  const [selectionTimeout, setSelectionTimeout] = useState(null);

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

  const applyHighlight = useCallback((index, length, color = '#ffff00') => {
    const quill = quillRef.current?.getEditor();
    if (quill && typeof index === 'number' && typeof length === 'number') {
      quill.formatText(index, length, {
        'background': color,
        'color': '#000000',
      });
    }
  }, []);

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

  const handleSelectionChange = useCallback((range, source, editor) => {
    if (!editor || !editor.root) {
      console.error('Editor oder editor.root ist nicht verfügbar');
      return;
    }
    if (selectionTimeout) clearTimeout(selectionTimeout);
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const handleSelection = () => {
      if (range && range.length > 0 && !isAdjusting) {
        const text = editor.getText(range.index, range.length);
        console.log('Ausgewählter Text:', text);
        setSelectedText(text);
        setHighlightedRange(range);
        setShowAdjustButton(true);
        setOriginalContent(editor.root.innerHTML);
        
        // Immer die Hervorhebung anwenden, auch auf mobilen Geräten
        applyHighlight(range.index, range.length);
      } else if (!isAdjusting) {
        setSelectedText('');
        setHighlightedRange(null);
        setShowAdjustButton(false);
        removeAllHighlights();
      }
    };

    if (isMobile) {
      setSelectionTimeout(setTimeout(handleSelection, 100)); // Reduzierte Verzögerung für mobile Geräte
    } else {
      handleSelection();
    }
  }, [setSelectedText, setHighlightedRange, isAdjusting, setOriginalContent, applyHighlight, removeAllHighlights]);

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
      const quill = quillRef.current.getEditor();
      console.log('Updating editor state', { isEditing, isAdjusting });
      quill.enable(isEditing && !isAdjusting);
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
      if (keepFormatting) {
        quill.insertText(highlightedRange.index, newText, {
          'color': '#008000',
          'background': '#e6ffe6'
        });
      } else {
        quill.insertText(highlightedRange.index, newText);
      }
      quill.setSelection(highlightedRange.index + newText.length, 0);
      const updatedContent = quill.root.innerHTML;
      setLocalValue(updatedContent);
    } else {
      console.error('Quill-Editor oder highlightedRange nicht verfügbar');
    }
  }, [highlightedRange]);

  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      setQuillRef({ current: quill });
    }
  }, [setQuillRef]);

  const applyAdjustmentMobile = useCallback((newText, keepFormatting = true) => {
    console.log('applyAdjustmentMobile aufgerufen', { newText, highlightedRange, keepFormatting });
    const quill = quillRef.current?.getEditor();
    if (quill && highlightedRange) {
      quill.deleteText(highlightedRange.index, highlightedRange.length);
      if (keepFormatting) {
        quill.insertText(highlightedRange.index, newText, {
          'color': '#008000',
          'background': '#e6ffe6'
        });
      } else {
        quill.insertText(highlightedRange.index, newText);
      }
      quill.setSelection(highlightedRange.index + newText.length, 0);
      
      // Aktualisieren Sie den lokalen Wert und den Kontext-Wert
      const updatedContent = quill.root.innerHTML;
      setLocalValue(updatedContent);
      updateValue(updatedContent);
    } else {
      console.error('Quill-Editor oder highlightedRange nicht verfügbar');
    }
  }, [highlightedRange, updateValue]);

  useEffect(() => {
    if (newSelectedText && highlightedRange) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        applyAdjustmentMobile(newSelectedText);
      } else {
        applyAdjustment(newSelectedText);
      }
    }
  }, [newSelectedText, highlightedRange, applyAdjustment, applyAdjustmentMobile]);

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

  const onConfirmAdjustment = useCallback(() => {
    applyAdjustmentToEditor(newSelectedText, false);
    handleAcceptAdjustment();
  }, [applyAdjustmentToEditor, handleAcceptAdjustment, newSelectedText]);

  return (
    <div className="text-editor">
      <EditorToolbar
        readOnly={!isEditing}
        onAdjustText={adjustText}
        isAdjusting={isAdjusting}
        onConfirmAdjustment={onConfirmAdjustment}
        quillRef={quillRef}
        highlightedRange={highlightedRange}
        onAiAdjustment={handleAiAdjustment}
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
      <ReactQuill
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

Editor.defaultProps = {
  setEditorInstance: () => {},
};

Editor.displayName = 'Editor';

export default React.memo(Editor);
