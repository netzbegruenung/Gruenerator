import { useEffect, useCallback, useMemo } from 'react';

import type { GeneratedContent } from '@/types/baseform';

import useGeneratedTextStore from '@/stores/core/generatedTextStore';
import { extractEditableText, type Content } from '@/stores/hooks/useTextEditActions';

interface UseContentManagementParams {
  componentName: string;
  generatedContent?: GeneratedContent;
  initialContent?: string;
}

export function useContentManagement(params: UseContentManagementParams) {
  const { componentName, generatedContent, initialContent } = params;

  const value = useGeneratedTextStore((state) => state.getGeneratedText(componentName));
  const setGeneratedText = useGeneratedTextStore((state) => state.setGeneratedText);
  const pushToHistory = useGeneratedTextStore((state) => state.pushToHistory);

  const editableSource = useMemo(
    () => (generatedContent !== undefined && generatedContent !== null ? generatedContent : value),
    [generatedContent, value]
  );

  const editableText = useMemo(() => {
    const extracted = extractEditableText(editableSource as Content);
    return typeof extracted === 'string' ? extracted.trim() : '';
  }, [editableSource]);

  const hasSharepicContent = useMemo(() => {
    if (editableSource && typeof editableSource === 'object' && 'sharepic' in editableSource) {
      const sharepic = (editableSource as { sharepic?: unknown }).sharepic;
      if (Array.isArray(sharepic) && sharepic.length > 0) return true;
      if (sharepic && !Array.isArray(sharepic)) return true;
    }
    return false;
  }, [editableSource]);

  const hasEditableContent = editableText.length > 0;
  const hasAnyContent = hasEditableContent || hasSharepicContent;

  // Initialize with initial content if needed
  useEffect(() => {
    if (initialContent && !value) {
      setGeneratedText(componentName, initialContent);
    }
  }, [initialContent, value, setGeneratedText, componentName]);

  // Update store when generatedContent changes
  useEffect(() => {
    if (generatedContent) {
      const isMixedContent =
        typeof generatedContent === 'object' &&
        generatedContent !== null &&
        ('sharepic' in generatedContent || 'social' in generatedContent);

      if (isMixedContent) {
        // Store mixed content as-is (object), not stringified
        setGeneratedText(componentName, generatedContent, generatedContent);
      } else if (
        typeof generatedContent === 'object' &&
        generatedContent !== null &&
        'content' in generatedContent
      ) {
        const contentObj = generatedContent as { content?: string; metadata?: unknown };
        setGeneratedText(componentName, contentObj.content || '', contentObj.metadata);
      } else if (typeof generatedContent === 'string') {
        setGeneratedText(componentName, generatedContent);
      } else {
        // Fallback: store object as-is
        setGeneratedText(componentName, generatedContent as GeneratedContent, generatedContent);
      }
    }
  }, [generatedContent, setGeneratedText, componentName]);

  const handleLoadRecentText = useCallback(
    (content: string, metadata: unknown) => {
      setGeneratedText(componentName, content, metadata);
      pushToHistory(componentName);
    },
    [componentName, setGeneratedText, pushToHistory]
  );

  return {
    value,
    editableText,
    hasEditableContent,
    hasSharepicContent,
    hasAnyContent,
    setGeneratedText,
    pushToHistory,
    handleLoadRecentText,
  };
}
