import { useGeneratedTextStore } from '../../stores/generatedTextStore.js';

export interface EditChange {
  text_to_find?: string;
  replacement_text?: string;
  full_replace?: boolean;
}

export interface ApplyChangesResult {
  content: string | object;
  appliedCount: number;
  totalCount: number;
}

const replaceAllLiteral = (text: string, search: string, replacement: string): string => {
  if (!search) return text;
  return text.split(search).join(replacement);
};

export const extractEditableText = (content: unknown): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    if (
      obj.social &&
      typeof obj.social === 'object' &&
      (obj.social as Record<string, unknown>).content &&
      typeof (obj.social as Record<string, unknown>).content === 'string'
    ) {
      return (obj.social as Record<string, unknown>).content as string;
    }
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.text === 'string') return obj.text;
  }
  return '';
};

export const applyChangesToContent = (
  content: unknown,
  changes: EditChange[] = []
): ApplyChangesResult => {
  const current = extractEditableText(content);
  if (!current) {
    return { content: content as string | object, appliedCount: 0, totalCount: changes.length };
  }

  let updatedText = current;
  let changesApplied = 0;

  for (const change of changes) {
    const { text_to_find, replacement_text, full_replace } = change || {};

    if (full_replace === true && typeof replacement_text === 'string') {
      updatedText = replacement_text;
      changesApplied++;
      continue;
    }

    if (typeof text_to_find === 'string' && typeof replacement_text === 'string') {
      const before = updatedText;
      updatedText = replaceAllLiteral(updatedText, text_to_find, replacement_text);
      if (before !== updatedText) {
        changesApplied++;
      }
    }
  }

  let updatedContent: string | object = content as string | object;
  if (typeof content === 'string') {
    updatedContent = updatedText;
  } else if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    const updated = { ...obj };

    if (updated.social && typeof updated.social === 'object') {
      const social = updated.social as Record<string, unknown>;
      if (typeof social.content === 'string') {
        updated.social = { ...social, content: updatedText };
        if (typeof updated.content === 'string') {
          updated.content = updatedText;
        }
        updatedContent = updated;
      }
    } else if (typeof updated.content === 'string') {
      updated.content = updatedText;
      updatedContent = updated;
    }
  }

  return {
    content: updatedContent,
    appliedCount: changesApplied,
    totalCount: changes.length,
  };
};

export interface UseTextEditActionsReturn {
  getEditableText: () => string;
  applyEdits: (changes: EditChange[]) => { appliedCount: number; totalCount: number };
}

export const useTextEditActions = (componentName: string): UseTextEditActionsReturn => {
  const storeContent = useGeneratedTextStore((state) => state.generatedTexts[componentName] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore((state) => state.pushToHistory);

  const getEditableText = (): string => {
    const currentContent = useGeneratedTextStore.getState().generatedTexts[componentName] || '';
    return extractEditableText(currentContent);
  };

  const applyEdits = (changes: EditChange[]): { appliedCount: number; totalCount: number } => {
    if (storeContent) {
      pushToHistory(componentName);
    }

    const result = applyChangesToContent(storeContent, changes);
    setTextWithHistory(componentName, result.content as string);

    return {
      appliedCount: result.appliedCount,
      totalCount: result.totalCount,
    };
  };

  return {
    getEditableText,
    applyEdits,
  };
};
