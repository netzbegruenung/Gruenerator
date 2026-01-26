import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  type MDXEditorMethods,
} from '@mdxeditor/editor';
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';

import '@mdxeditor/editor/style.css';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { extractEditableText } from '../../../../stores/hooks/useTextEditActions';
import '../../../../assets/styles/components/edit-mode/finetune-editor.css';

const updateContentWithText = (
  originalContent: unknown,
  newText: string
): string | Record<string, unknown> => {
  if (typeof originalContent === 'string') {
    return newText;
  }

  if (typeof originalContent === 'object' && originalContent !== null) {
    const updated = { ...(originalContent as Record<string, unknown>) };

    const social = updated.social as Record<string, unknown> | undefined;
    if (social && typeof social === 'object' && typeof social.content === 'string') {
      updated.social = { ...social, content: newText };
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

interface FinetuneEditorProps {
  componentName: string;
  readOnly?: boolean;
}

const FinetuneEditor = ({ componentName, readOnly = false }: FinetuneEditorProps) => {
  const storeContent = useGeneratedTextStore((state) => state.generatedTexts[componentName] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore((state) => state.pushToHistory);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const editorRef = useRef<MDXEditorMethods>(null);
  const lastSavedContent = useRef('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialized = useRef(false);
  const isExternalUpdate = useRef(false);

  // Extract text content to check if we have anything to edit
  const textContent = useMemo(() => {
    const extracted = extractEditableText(storeContent) || '';
    console.log('[FinetuneEditor] Content extracted:', {
      componentName,
      length: extracted.length,
      preview: extracted.substring(0, 200),
      hasContent: extracted.length > 0,
    });
    return extracted;
  }, [storeContent, componentName]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const initialContent = useMemo(() => {
    const text = textContent;
    // Don't update lastSavedContent here - let external update effect handle it
    // Otherwise the comparison in the effect will see no difference and skip setMarkdown()
    console.log('[FinetuneEditor] Initial content set:', {
      componentName,
      length: text.length,
      preview: text.substring(0, 200),
      isEmpty: text.length === 0,
    });
    return text;
  }, [textContent, componentName]);

  useEffect(() => {
    if (!isInitialized.current && editorRef.current) {
      isInitialized.current = true;
      // Initialize the ref with current content so we don't trigger unnecessary updates
      lastSavedContent.current = textContent;
      console.log('[FinetuneEditor] Initialized with content:', {
        componentName,
        length: textContent.length,
      });
    }
  }, [textContent, componentName]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    console.log('[FinetuneEditor] Update check:', {
      componentName,
      hasRef: !!editorRef.current,
      isInitialized: isInitialized.current,
      storeContentLength: typeof storeContent === 'string' ? storeContent.length : 0,
    });

    if (!editorRef.current || !isInitialized.current) return;

    const newText = extractEditableText(storeContent) || '';

    console.log('[FinetuneEditor] Comparing content:', {
      componentName,
      newLength: newText.length,
      oldLength: lastSavedContent.current.length,
      isDifferent: newText !== lastSavedContent.current,
    });

    if (newText !== lastSavedContent.current) {
      console.log('[FinetuneEditor] Updating markdown:', {
        componentName,
        contentLength: newText.length,
        preview: newText.substring(0, 100),
      });
      isExternalUpdate.current = true;
      editorRef.current.setMarkdown(newText);
      lastSavedContent.current = newText;
      setTimeout(() => {
        isExternalUpdate.current = false;
      }, 0);
    }
  }, [storeContent, componentName]);

  const handleChange = useCallback(
    (markdown: string) => {
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
        const currentStoreContent =
          useGeneratedTextStore.getState().generatedTexts[componentName] || '';

        pushToHistory(componentName);

        const updatedContent = updateContentWithText(currentStoreContent, markdown);
        setTextWithHistory(componentName, updatedContent);
        lastSavedContent.current = markdown;
      }, 300);
    },
    [componentName, pushToHistory, setTextWithHistory]
  );

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            {!isMobile && <BlockTypeSelect />}
            <BoldItalicUnderlineToggles />
          </>
        ),
      }),
    ],
    [isMobile]
  );

  // All hooks are above - now we can safely return early
  // Don't render MDXEditor if there's no text content
  if (!textContent.trim()) {
    return null;
  }

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

export default FinetuneEditor;
