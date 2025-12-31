import { useState, useCallback, useRef } from 'react';
import { PLATFORM_ALIASES } from '../utils/autocompleteUtils';

/**
 * Default tag dictionary for template descriptions
 */
export const TAG_DICTIONARY = [
  'instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube',
  'story', 'post', 'banner', 'header', 'flyer', 'plakat', 'logo',
  'quadrat', 'hochformat', 'querformat', 'linkvorschau', 'titelbild',
  'canva', 'green', 'gruen', 'wahlkampf', 'social', 'reel', 'video',
  'pressemitteilung', 'sharepic', 'aktion'
];

/**
 * Platform dictionary derived from PLATFORM_ALIASES
 * Includes both platform names and their aliases
 */
export const PLATFORM_DICTIONARY = [
  ...Object.keys(PLATFORM_ALIASES),
  ...Object.values(PLATFORM_ALIASES).flat()
];

/**
 * Combined dictionary with all terms
 */
export const COMBINED_DICTIONARY = [...new Set([...TAG_DICTIONARY, ...PLATFORM_DICTIONARY])];

/**
 * useTextAutocomplete - Reusable hook for ghost-text autocomplete in textareas
 *
 * Shows inline suggestions as user types, accepting with Tab or Enter.
 * Works with hashtags (#insta...) or plain words (insta...).
 *
 * @param {string} value - Current textarea value
 * @param {Function} setValue - Function to update the value
 * @param {Object} options - Configuration options
 * @param {string[]} options.dictionary - Array of words to suggest (default: COMBINED_DICTIONARY)
 * @param {number} options.minChars - Minimum characters before suggesting (default: 3)
 * @param {boolean} options.requireHashtag - Only suggest after # (default: false)
 * @param {boolean} options.addHashtagOnAccept - Add # prefix when accepting (default: true)
 *
 * @returns {Object} Autocomplete state and handlers
 *
 * @example
 * const autocomplete = useTextAutocomplete(description, setDescription, {
 *   dictionary: TAG_DICTIONARY
 * });
 *
 * <div className="textarea-wrapper">
 *   {autocomplete.suggestionSuffix && (
 *     <div className="ghost-text">
 *       <span>{autocomplete.ghostPrefix}</span>
 *       <span className="suggestion">{autocomplete.suggestionSuffix}</span>
 *     </div>
 *   )}
 *   <textarea
 *     ref={autocomplete.textareaRef}
 *     value={description}
 *     onChange={autocomplete.handleChange}
 *     onKeyDown={autocomplete.handleKeyDown}
 *   />
 * </div>
 */
export function useTextAutocomplete(value, setValue, options = {}) {
  const {
    dictionary = COMBINED_DICTIONARY,
    minChars = 3,
    requireHashtag = false,
    addHashtagOnAccept = true
  } = options;

  const [suggestion, setSuggestion] = useState(null);
  const [suggestionSuffix, setSuggestionSuffix] = useState('');
  const [searchStart, setSearchStart] = useState(-1);
  const [ghostPrefix, setGhostPrefix] = useState('');
  const [hasHashtag, setHasHashtag] = useState(true);
  const textareaRef = useRef(null);

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
    setSuggestionSuffix('');
    setSearchStart(-1);
    setGhostPrefix('');
    setHasHashtag(true);
  }, []);

  const findMatch = useCallback((searchTerm) => {
    const termLower = searchTerm.toLowerCase();
    return dictionary.find(word =>
      word.toLowerCase().startsWith(termLower) && word.toLowerCase() !== termLower
    );
  }, [dictionary]);

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    setValue(newValue);

    const textBeforeCursor = newValue.substring(0, cursorPos);

    const hashMatch = textBeforeCursor.match(/#([\w]*)$/);
    const wordMatch = !hashMatch && !requireHashtag &&
      textBeforeCursor.match(new RegExp(`(?:^|[\\s])([a-zA-ZäöüÄÖÜß]{${minChars},})$`));

    if (hashMatch && hashMatch[1].length >= Math.max(1, minChars - 1)) {
      const searchTerm = hashMatch[1];
      const startPos = cursorPos - hashMatch[0].length;
      const match = findMatch(searchTerm);

      if (match) {
        setSearchStart(startPos);
        setSuggestion(match);
        setSuggestionSuffix(match.substring(searchTerm.length));
        setGhostPrefix(textBeforeCursor);
        setHasHashtag(true);
      } else {
        clearSuggestion();
      }
    } else if (wordMatch) {
      const searchTerm = wordMatch[1];
      const match = findMatch(searchTerm);

      if (match) {
        const wordStart = cursorPos - wordMatch[1].length;
        setSearchStart(wordStart);
        setSuggestion(match);
        setSuggestionSuffix(match.substring(searchTerm.length));
        setGhostPrefix(
          addHashtagOnAccept
            ? textBeforeCursor.slice(0, -wordMatch[1].length) + '#' + wordMatch[1]
            : textBeforeCursor
        );
        setHasHashtag(false);
      } else {
        clearSuggestion();
      }
    } else {
      clearSuggestion();
    }
  }, [setValue, clearSuggestion, findMatch, minChars, requireHashtag, addHashtagOnAccept]);

  const acceptSuggestion = useCallback(() => {
    if (!suggestion || searchStart === -1) return false;

    const before = value.substring(0, searchStart);
    const cursorPos = textareaRef.current?.selectionStart || searchStart;
    const after = value.substring(cursorPos);

    const prefix = addHashtagOnAccept ? '#' : '';
    const newValue = before + prefix + suggestion + ' ' + after;

    setValue(newValue);
    clearSuggestion();

    setTimeout(() => {
      const newPos = before.length + prefix.length + suggestion.length + 1;
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);

    return true;
  }, [value, suggestion, searchStart, setValue, clearSuggestion, addHashtagOnAccept]);

  const handleKeyDown = useCallback((e) => {
    if (!suggestion) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === 'Enter') {
      if (acceptSuggestion()) {
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      clearSuggestion();
    }
  }, [suggestion, acceptSuggestion, clearSuggestion]);

  const reset = useCallback(() => {
    clearSuggestion();
  }, [clearSuggestion]);

  return {
    textareaRef,
    suggestion,
    suggestionSuffix,
    ghostPrefix,
    hasHashtag,
    handleChange,
    handleKeyDown,
    acceptSuggestion,
    reset,
    hasSuggestion: !!suggestion
  };
}

export default useTextAutocomplete;
