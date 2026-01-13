import { useState, useEffect, useCallback } from 'react';

type SearchMode = 'local' | 'remote' | 'hybrid';

interface SearchStateConfig {
    mode?: SearchMode;
    onRemoteSearch?: (query: string, searchMode: string) => void;
    onClearRemoteSearch?: () => void;
    debounceMs?: { remote: number; local: number };
    searchMode?: string;
    initialQuery?: string;
}

/**
 * Custom hook for managing search state with debouncing
 * Supports both local and remote search patterns with proper state management
 *
 * @param {Object} config - Configuration options
 * @param {string} config.mode - 'local', 'remote', or 'hybrid' search mode
 * @param {Function} config.onRemoteSearch - Callback for remote search (query, searchMode) => void
 * @param {Function} config.onClearRemoteSearch - Callback to clear remote search results
 * @param {Object} config.debounceMs - Debounce delays { remote: 400, local: 300 }
 * @param {string} config.searchMode - Search mode for remote searches ('intelligent', 'fulltext')
 * @param {string} config.initialQuery - Initial search query value
 *
 * @returns {Object} Search state and control functions
 */
export const useSearchState = ({
    mode = 'local',
    onRemoteSearch,
    onClearRemoteSearch,
    debounceMs = { remote: 400, local: 300 },
    searchMode = 'intelligent',
    initialQuery = ''
}: SearchStateConfig) => {
    // Core search state
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [currentSearchMode, setCurrentSearchMode] = useState(searchMode);
    
    // Search timing states
    const [searchPending, setSearchPending] = useState(false);
    const [localSearchPending, setLocalSearchPending] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    
    // Determine if we're using remote search
    const isRemoteMode = mode === 'remote' || mode === 'hybrid';
    const isLocalMode = mode === 'local' || mode === 'hybrid';
    
    // Debounced remote search effect
    useEffect(() => {
        if (!isRemoteMode || !onRemoteSearch) return;
        
        const q = (searchQuery || '').trim();
        
        // Set pending state when user types
        if (q) {
            setSearchPending(true);
        }
        
        const handle = setTimeout(() => {
            setSearchPending(false);
            if (q) {
                setHasSearched(true);
                onRemoteSearch(q, currentSearchMode);
            } else {
                setHasSearched(false);
                if (onClearRemoteSearch) {
                    onClearRemoteSearch();
                }
            }
        }, debounceMs.remote);
        
        return () => {
            clearTimeout(handle);
            if (!q) {
                setSearchPending(false);
                setHasSearched(false);
            }
        };
    }, [searchQuery, currentSearchMode, isRemoteMode, onRemoteSearch, onClearRemoteSearch, debounceMs.remote]);
    
    // Debounced local search effect
    useEffect(() => {
        if (!isLocalMode) return;
        
        const q = (searchQuery || '').trim();
        
        if (q) {
            setLocalSearchPending(true);
        }
        
        const handle = setTimeout(() => {
            setLocalSearchPending(false);
            setHasSearched(q.length > 0);
        }, debounceMs.local);
        
        return () => {
            clearTimeout(handle);
            if (!q) {
                setLocalSearchPending(false);
                setHasSearched(false);
            }
        };
    }, [searchQuery, isLocalMode, debounceMs.local]);
    
    // Computed states
    const isSearching = searchPending || localSearchPending;
    const canShowResults = hasSearched && !isSearching;
    const hasQuery = (searchQuery || '').trim().length > 0;
    
    // Helper methods
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchPending(false);
        setLocalSearchPending(false);
        setHasSearched(false);
        
        if (onClearRemoteSearch) {
            onClearRemoteSearch();
        }
    }, [onClearRemoteSearch]);
    
    const getSearchStatus = useCallback((isRemoteSearching = false) => {
        if (!hasQuery) {
            return null; // No status message when no query
        }
        
        if (searchPending || localSearchPending) {
            return 'Eingabe läuft...';
        }
        
        if (isRemoteSearching && isRemoteMode) {
            return 'Suche läuft…';
        }
        
        if (hasSearched && canShowResults) {
            return null; // Let caller handle "no results" message
        }
        
        if (hasQuery && !hasSearched) {
            return 'Suche wird vorbereitet...';
        }
        
        return null;
    }, [hasQuery, searchPending, localSearchPending, isRemoteMode, hasSearched, canShowResults]);
    
    const shouldShowNoResults = useCallback((itemCount = 0, isRemoteSearching = false) => {
        return hasQuery && 
               canShowResults && 
               !isRemoteSearching && 
               itemCount === 0;
    }, [hasQuery, canShowResults]);
    
    const shouldFilterLocally = useCallback(() => {
        return isLocalMode && hasQuery && !localSearchPending && hasSearched;
    }, [isLocalMode, hasQuery, localSearchPending, hasSearched]);
    
    return {
        // Core state
        searchQuery,
        setSearchQuery,
        searchMode: currentSearchMode,
        setSearchMode: setCurrentSearchMode,
        
        // Status flags
        searchPending,
        localSearchPending,
        hasSearched,
        isSearching,
        canShowResults,
        hasQuery,
        
        // Helper methods
        clearSearch,
        getSearchStatus,
        shouldShowNoResults,
        shouldFilterLocally,
        
        // Configuration
        isRemoteMode,
        isLocalMode
    };
};

export default useSearchState;
