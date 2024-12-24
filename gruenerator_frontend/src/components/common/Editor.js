import React, { useContext, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ReactQuill from 'react-quill';
import { EditorToolbar } from './EditorToolbar';
import 'react-quill/dist/quill.snow.css';
import { FormContext } from '../utils/FormContext';
import { applyHighlightWithAnimation } from '../utils/highlightUtils';

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
      } catch (error) {
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
        quill.enable(isEditing && !isAdjusting);
      } catch (error) {
        // Fehlerbehandlung
      }
    }
  }, [isEditing, isAdjusting]);

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
