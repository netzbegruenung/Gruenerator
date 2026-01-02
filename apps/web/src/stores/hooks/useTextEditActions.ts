import useGeneratedTextStore from '../core/generatedTextStore';

interface TextChange {
  text_to_find?: string;
  replacement_text?: string;
  full_replace?: boolean;
}

interface ContentObject {
  social?: { content?: string; [key: string]: unknown };
  content?: string;
  text?: string;
  sharepic?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

export type Content = string | ContentObject | null | undefined;

interface ApplyChangesResult {
  content: Content;
  appliedCount: number;
  totalCount: number;
}

// Replace all occurrences of a substring (literal) in a string
const replaceAllLiteral = (text: string, search: string, replacement: string): string => {
  if (!search) return text;
  return text.split(search).join(replacement);
};

// Extract the editable text from mixed or plain content
export const extractEditableText = (content: Content): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content?.social?.content && typeof content.social.content === 'string') return content.social.content;
    if (typeof content.content === 'string') return content.content;
    if (typeof content.text === 'string') return content.text;
  }
  return '';
};

// Apply changes to a content object or string, return updated structure with metadata
export const applyChangesToContent = (content: Content, changes: TextChange[] = []): ApplyChangesResult => {
  const current = extractEditableText(content);
  if (!current) {
    return { content, appliedCount: 0, totalCount: changes.length };
  }

  let updatedText = current;
  let changesApplied = 0;

  for (const change of changes) {
    const { text_to_find, replacement_text, full_replace } = change || {};

    // Handle full text replacement
    if (full_replace === true && typeof replacement_text === 'string') {
      updatedText = replacement_text;
      changesApplied++;
      continue;
    }

    // Handle partial replacement
    if (typeof text_to_find === 'string' && typeof replacement_text === 'string') {
      const before = updatedText;
      updatedText = replaceAllLiteral(updatedText, text_to_find, replacement_text);
      if (before !== updatedText) {
        changesApplied++;
      }
    }
  }

  // Build updated content structure
  let updatedContent = content;
  if (typeof content === 'string') {
    updatedContent = updatedText;
  } else if (typeof content === 'object' && content !== null) {
    const updated = { ...content };
    if (updated.social && typeof updated.social === 'object' && typeof updated.social.content === 'string') {
      updated.social = { ...updated.social, content: updatedText };
      if (typeof updated.content === 'string') {
        updated.content = updatedText;
      }
      updatedContent = updated;
    } else if (typeof updated.content === 'string') {
      updated.content = updatedText;
      updatedContent = updated;
    }
  }

  return {
    content: updatedContent,
    appliedCount: changesApplied,
    totalCount: changes.length
  };
};

// Hook exposing high-level text edit actions while keeping the store simple
const useTextEditActions = (componentName: string) => {
  const storeContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
  const setTextWithHistory = useGeneratedTextStore(state => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore(state => state.pushToHistory);

  const getEditableText = (): string => {
    // Read directly from store to get latest value after applyEdits
    const currentContent = useGeneratedTextStore.getState().generatedTexts[componentName] || '';
    return extractEditableText(currentContent);
  };

  const applyEdits = (changes: TextChange[]): { appliedCount: number; totalCount: number } => {
    // Push current state to history before applying changes
    if (storeContent) {
      pushToHistory(componentName);
    }

    const result = applyChangesToContent(storeContent, changes);
    // Extract the text to store - setTextWithHistory expects a string
    const textToStore = extractEditableText(result.content);
    setTextWithHistory(componentName, textToStore);
    return {
      appliedCount: result.appliedCount,
      totalCount: result.totalCount
    };
  };

  return {
    getEditableText,
    applyEdits,
  };
};

export default useTextEditActions;

