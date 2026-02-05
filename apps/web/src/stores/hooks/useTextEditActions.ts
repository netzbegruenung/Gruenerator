import useGeneratedTextStore from '../core/generatedTextStore';

// Debug helper: Detect invisible character issues
function detectInvisibleChars(text: string): string[] {
  const issues: string[] = [];
  if (text.includes('\u00A0'))
    issues.push(
      `Contains non-breaking spaces (\\u00A0) at positions: ${[...text]
        .map((c, i) => (c === '\u00A0' ? i : -1))
        .filter((i) => i >= 0)
        .slice(0, 5)
        .join(', ')}`
    );
  if (text.includes('\r')) issues.push('Contains carriage returns (\\r)');
  if (text.includes('\u200B')) issues.push('Contains zero-width spaces (\\u200B)');
  if (text.includes('\u2018') || text.includes('\u2019'))
    issues.push('Contains smart single quotes');
  if (text.includes('\u201C') || text.includes('\u201D'))
    issues.push('Contains smart double quotes');
  return issues;
}

// Debug helper: Find first mismatch position
function findFirstMismatch(haystack: string, needle: string): string | null {
  const searchPrefix = needle.substring(0, Math.min(10, needle.length));
  const idx = haystack.indexOf(searchPrefix);
  if (idx === -1) {
    return `Cannot find first 10 chars: "${JSON.stringify(searchPrefix)}"`;
  }
  for (let i = 0; i < needle.length && idx + i < haystack.length; i++) {
    if (haystack[idx + i] !== needle[i]) {
      return `Mismatch at pos ${i}: haystack='${haystack[idx + i]}' (${haystack.charCodeAt(idx + i)}) vs needle='${needle[i]}' (${needle.charCodeAt(i)})`;
    }
  }
  return null;
}

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
    if (content?.social?.content && typeof content.social.content === 'string')
      return content.social.content;
    if (typeof content.content === 'string') return content.content;
    if (typeof content.text === 'string') return content.text;
  }
  return '';
};

// Apply changes to a content object or string, return updated structure with metadata
export const applyChangesToContent = (
  content: Content,
  changes: TextChange[] = []
): ApplyChangesResult => {
  const current = extractEditableText(content);

  // DEBUG: Log the current text state
  console.group('[applyChangesToContent] === APPLYING CHANGES ===');
  console.log('[applyChangesToContent] current text length:', current?.length || 0);
  console.log(
    '[applyChangesToContent] current text (escaped):',
    JSON.stringify(current?.substring(0, 300) || '')
  );
  console.log('[applyChangesToContent] changes count:', changes.length);

  const currentIssues = current ? detectInvisibleChars(current) : [];
  if (currentIssues.length > 0) {
    console.warn('[applyChangesToContent] current text invisible char issues:', currentIssues);
  }

  if (!current) {
    console.warn('[applyChangesToContent] No current text to apply changes to');
    console.groupEnd();
    return { content, appliedCount: 0, totalCount: changes.length };
  }

  let updatedText = current;
  let changesApplied = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const { text_to_find, replacement_text, full_replace } = change || {};

    console.group(`[applyChangesToContent] --- Change ${i + 1}/${changes.length} ---`);

    // Handle full text replacement
    if (full_replace === true && typeof replacement_text === 'string') {
      console.log('[applyChangesToContent] Type: FULL_REPLACE');
      console.log(
        '[applyChangesToContent] replacement preview:',
        replacement_text.substring(0, 100)
      );
      updatedText = replacement_text;
      changesApplied++;
      console.log('[applyChangesToContent] ✅ Applied full replace');
      console.groupEnd();
      continue;
    }

    // Handle partial replacement
    if (typeof text_to_find === 'string' && typeof replacement_text === 'string') {
      console.log('[applyChangesToContent] Type: PARTIAL_REPLACE');
      console.log('[applyChangesToContent] text_to_find (escaped):', JSON.stringify(text_to_find));
      console.log('[applyChangesToContent] text_to_find length:', text_to_find.length);
      console.log(
        '[applyChangesToContent] replacement_text (escaped):',
        JSON.stringify(replacement_text.substring(0, 100))
      );

      // Check for exact match BEFORE replacement
      const exactMatch = updatedText.includes(text_to_find);
      console.log('[applyChangesToContent] EXACT MATCH EXISTS:', exactMatch);

      if (!exactMatch) {
        // Diagnose the mismatch
        const textToFindIssues = detectInvisibleChars(text_to_find);
        if (textToFindIssues.length > 0) {
          console.warn(
            '[applyChangesToContent] text_to_find invisible char issues:',
            textToFindIssues
          );
        }

        const mismatch = findFirstMismatch(updatedText, text_to_find);
        if (mismatch) {
          console.warn('[applyChangesToContent] First mismatch:', mismatch);
        }

        // Log character codes for first 10 chars of text_to_find
        console.log(
          '[applyChangesToContent] First 10 charCodes of text_to_find:',
          [...text_to_find.substring(0, 10)]
            .map((c, j) => `[${j}]'${c}'=${c.charCodeAt(0)}`)
            .join(' ')
        );

        // Try to find where in updatedText a similar string might be
        const searchPrefix = text_to_find.substring(0, 20);
        const prefixIdx = updatedText.indexOf(searchPrefix);
        if (prefixIdx >= 0) {
          console.log(`[applyChangesToContent] Found prefix at position ${prefixIdx}`);
          console.log(
            '[applyChangesToContent] Surrounding text:',
            JSON.stringify(
              updatedText.substring(
                Math.max(0, prefixIdx - 10),
                prefixIdx + text_to_find.length + 10
              )
            )
          );
        } else {
          console.warn('[applyChangesToContent] Cannot find even the first 20 chars in text');
        }
      }

      const before = updatedText;
      updatedText = replaceAllLiteral(updatedText, text_to_find, replacement_text);
      if (before !== updatedText) {
        changesApplied++;
        console.log('[applyChangesToContent] ✅ Change applied successfully');
      } else {
        console.error('[applyChangesToContent] ❌ Change NOT applied - no match found');
      }
    } else {
      console.warn(
        '[applyChangesToContent] Invalid change - missing text_to_find or replacement_text'
      );
    }

    console.groupEnd();
  }

  console.log('[applyChangesToContent] === RESULT ===');
  console.log('[applyChangesToContent] Applied:', changesApplied, '/', changes.length);
  console.groupEnd();

  // Build updated content structure
  let updatedContent = content;
  if (typeof content === 'string') {
    updatedContent = updatedText;
  } else if (typeof content === 'object' && content !== null) {
    const updated = { ...content };
    if (
      updated.social &&
      typeof updated.social === 'object' &&
      typeof updated.social.content === 'string'
    ) {
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
    totalCount: changes.length,
  };
};

// Hook exposing high-level text edit actions while keeping the store simple
const useTextEditActions = (componentName: string) => {
  const storeContent = useGeneratedTextStore((state) => state.generatedTexts[componentName] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore((state) => state.pushToHistory);

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
      totalCount: result.totalCount,
    };
  };

  return {
    getEditableText,
    applyEdits,
  };
};

export default useTextEditActions;
