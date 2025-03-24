import { useCallback, useEffect, useMemo, useRef } from 'react';
import { EDITOR_FORMATS, EDITOR_MODULES } from '../utils/constants';

const useQuillEditor = (quillRef, updateValue, setLocalValue, isEditing, isAdjusting) => {
  const isProgrammaticChange = useRef(false);

  const formats = useMemo(() => EDITOR_FORMATS, []);
  const modules = useMemo(() => EDITOR_MODULES, []);

  const handleChange = useCallback((content, source) => {
    setLocalValue(content);
    if (isEditing && source === 'user') {
      updateValue(content);
    }
  }, [isEditing, updateValue, setLocalValue]);

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
  }, [quillRef, setLocalValue]);

  useEffect(() => {
    if (quillRef.current) {
      try {
        const quill = quillRef.current.getEditor();
        quill.enable(isEditing && !isAdjusting);
      } catch (error) {
        console.error('[Editor] Fehler beim Aktivieren/Deaktivieren des Editors:', error);
      }
    }
  }, [isEditing, isAdjusting, quillRef]);

  return {
    formats,
    modules,
    handleChange,
    setEditorContent,
    getEditorInterface: useCallback(() => ({
      setContent: setEditorContent,
      getHtmlContent: () => {
        const editor = quillRef.current?.getEditor();
        return editor?.root.innerHTML;
      },
      getDelta: () => {
        const editor = quillRef.current?.getEditor();
        return editor?.getContents();
      },
      focus: () => {
        const editor = quillRef.current?.getEditor();
        editor?.focus();
      },
    }), [setEditorContent, quillRef])
  };
};

export default useQuillEditor; 