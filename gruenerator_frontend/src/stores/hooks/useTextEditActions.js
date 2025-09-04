import useGeneratedTextStore from '../core/generatedTextStore';

// Replace all occurrences of a substring (literal) in a string
const replaceAllLiteral = (text, search, replacement) => {
  if (!search) return text;
  return text.split(search).join(replacement);
};

// Extract the editable text from mixed or plain content
export const extractEditableText = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content?.social?.content && typeof content.social.content === 'string') return content.social.content;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
};

// Apply changes to a content object or string, return updated structure
export const applyChangesToContent = (content, changes = []) => {
  const current = extractEditableText(content);
  if (!current) return content;

  let updatedText = current;
  for (const change of changes) {
    const { text_to_find, replacement_text } = change || {};
    if (typeof text_to_find === 'string' && typeof replacement_text === 'string') {
      updatedText = replaceAllLiteral(updatedText, text_to_find, replacement_text);
    }
  }

  if (typeof content === 'string') return updatedText;
  if (typeof content === 'object' && content !== null) {
    const updated = { ...content };
    if (updated.social && typeof updated.social === 'object' && typeof updated.social.content === 'string') {
      updated.social = { ...updated.social, content: updatedText };
      // Keep top-level content in sync if present as alias
      if (typeof updated.content === 'string') {
        updated.content = updatedText;
      }
      return updated;
    }
    if (typeof updated.content === 'string') {
      updated.content = updatedText;
      return updated;
    }
  }
  return content;
};

// Hook exposing high-level text edit actions while keeping the store simple
const useTextEditActions = (componentName) => {
  const storeContent = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const setTextWithHistory = useGeneratedTextStore(state => state.setTextWithHistory);
  const pushToHistory = useGeneratedTextStore(state => state.pushToHistory);

  const getEditableText = () => extractEditableText(storeContent);

  const applyEdits = (changes) => {
    // Push current state to history before applying changes
    if (storeContent) {
      pushToHistory(componentName);
    }
    
    const updated = applyChangesToContent(storeContent, changes);
    setTextWithHistory(componentName, updated);
    return updated;
  };

  return {
    getEditableText,
    applyEdits,
  };
};

export default useTextEditActions;

