import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { extractEditableText } from '../../../../stores/hooks/useTextEditActions';
import '../../../../assets/styles/components/edit-mode/finetune-editor.css';

const updateContentWithText = (originalContent, newText) => {
  if (typeof originalContent === 'string') {
    return newText;
  }

  if (typeof originalContent === 'object' && originalContent !== null) {
    const updated = { ...originalContent };

    if (updated.social && typeof updated.social === 'object' && typeof updated.social.content === 'string') {
      updated.social = { ...updated.social, content: newText };
      if (typeof updated.content === 'string') {
        updated.content = newText;
      }
      return updated;
    }

    if (typeof updated.content === 'string') {
      updated.content = newText;
      return updated;
    }
  }

  return newText;
};

const FinetuneEditor = ({ componentName, readOnly = false }) => {
  const storeContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
  const setTextWithHistory = useGeneratedTextStore(state => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore(state => state.pushToHistory);

  const editorRef = useRef(null);
  const lastSavedContent = useRef('');
  const debounceTimer = useRef(null);
  const isInitialized = useRef(false);
  const isExternalUpdate = useRef(false);

  const initialContent = useMemo(() => {
    const text = extractEditableText(storeContent) || '';
    lastSavedContent.current = text;
    return text;
  }, []);

  useEffect(() => {
    if (!isInitialized.current && editorRef.current) {
      isInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current || !isInitialized.current) return;

    const newText = extractEditableText(storeContent) || '';

    if (newText !== lastSavedContent.current) {
      isExternalUpdate.current = true;
      editorRef.current.setMarkdown(newText);
      lastSavedContent.current = newText;
      setTimeout(() => {
        isExternalUpdate.current = false;
      }, 0);
    }
  }, [storeContent]);

  const handleChange = useCallback((markdown) => {
    if (isExternalUpdate.current) {
      return;
    }

    if (markdown === lastSavedContent.current) {
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const currentStoreContent = useGeneratedTextStore.getState().generatedTexts[componentName] || '';

      pushToHistory(componentName);

      const updatedContent = updateContentWithText(currentStoreContent, markdown);
      setTextWithHistory(componentName, updatedContent);
      lastSavedContent.current = markdown;
    }, 300);
  }, [componentName, pushToHistory, setTextWithHistory]);

  const plugins = useMemo(() => [
    headingsPlugin(),
    listsPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    toolbarPlugin({
      toolbarContents: () => (
        <>
          <BlockTypeSelect />
          <BoldItalicUnderlineToggles />
          <ListsToggle />
        </>
      )
    })
  ], []);

  return (
    <div className="finetune-editor" data-readonly={readOnly}>
      <MDXEditor
        ref={editorRef}
        markdown={initialContent}
        onChange={handleChange}
        plugins={plugins}
        contentEditableClassName="finetune-editor-content"
        readOnly={readOnly}
      />
    </div>
  );
};

FinetuneEditor.propTypes = {
  componentName: PropTypes.string.isRequired,
  readOnly: PropTypes.bool
};

export default FinetuneEditor;
