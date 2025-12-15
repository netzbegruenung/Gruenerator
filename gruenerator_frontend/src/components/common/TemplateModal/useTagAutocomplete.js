import { useState, useCallback, useRef } from 'react';
import { TAG_DICTIONARY } from './tagConstants';

export function useTagAutocomplete(value, setValue) {
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

    const handleChange = useCallback((e) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;
        setValue(newValue);

        const textBeforeCursor = newValue.substring(0, cursorPos);

        const hashMatch = textBeforeCursor.match(/#([\w]*)$/);
        const wordMatch = !hashMatch && textBeforeCursor.match(/(?:^|[\s])([a-zA-Z]{3,})$/);

        if (hashMatch && hashMatch[1].length > 0) {
            const searchTerm = hashMatch[1].toLowerCase();
            const startPos = cursorPos - hashMatch[0].length;

            const match = TAG_DICTIONARY.find(tag =>
                tag.startsWith(searchTerm) && tag !== searchTerm
            );

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
            const searchTerm = wordMatch[1].toLowerCase();
            const match = TAG_DICTIONARY.find(tag =>
                tag.startsWith(searchTerm) && tag !== searchTerm
            );

            if (match) {
                const wordStart = cursorPos - wordMatch[1].length;
                setSearchStart(wordStart);
                setSuggestion(match);
                setSuggestionSuffix(match.substring(searchTerm.length));
                setGhostPrefix(textBeforeCursor.slice(0, -wordMatch[1].length) + '#' + wordMatch[1]);
                setHasHashtag(false);
            } else {
                clearSuggestion();
            }
        } else {
            clearSuggestion();
        }
    }, [setValue, clearSuggestion]);

    const acceptSuggestion = useCallback(() => {
        if (!suggestion || searchStart === -1) return false;

        const before = value.substring(0, searchStart);
        const cursorPos = textareaRef.current?.selectionStart || searchStart;
        const after = value.substring(cursorPos);
        const newValue = before + '#' + suggestion + ' ' + after;

        setValue(newValue);
        clearSuggestion();

        setTimeout(() => {
            const newPos = before.length + suggestion.length + 2;
            textareaRef.current?.setSelectionRange(newPos, newPos);
            textareaRef.current?.focus();
        }, 0);

        return true;
    }, [value, suggestion, searchStart, setValue, clearSuggestion]);

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
        handleChange,
        handleKeyDown,
        acceptSuggestion,
        reset
    };
}
