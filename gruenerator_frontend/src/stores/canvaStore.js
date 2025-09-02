import React from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import * as canvaUtils from '../components/utils/canvaUtils';
import { profileApiService } from '../features/auth/services/profileApiService';

// Debounce utility for search performance
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// External cache to prevent Zustand state mutations
let filterCache = {
  cacheKey: null,
  result: []
};

/**
 * Unified Canva Store following wolkeStore pattern
 * Manages connection state, designs cache, and templates with optimistic updates
 * 
 * Performance optimizations:
 * - Cached designs persist between tab switches
 * - Optimistic updates for instant UI feedback
 * - Memoized selectors to prevent unnecessary re-renders
 * - Debounced API calls
 */
export const useCanvaStore = create(
  subscribeWithSelector(
    immer((set, get) => ({
      // === CONNECTION STATE ===
      connected: false,
      user: null,
      loading: false,
      connectionChecked: false,
      
      // === DESIGNS CACHE ===
      designs: [],
      designsLoading: false,
      designsError: null,
      designsLastFetched: null,
      designsStaleTime: 5 * 60 * 1000, // 5 minutes
      
      // === TEMPLATES STATE ===
      savedDesigns: new Set(), // Track which designs have been saved as templates
      savingDesign: null,
      
      // === UI STATE ===
      activeSubsection: 'overview', // 'overview' | 'vorlagen' | 'assets'
      searchQuery: '',
      debouncedSearchQuery: '', // The actual search query used for filtering
      filterType: 'all',
      sortBy: 'modified_descending',
      
      // === MESSAGES ===
      error: null,
      successMessage: '',
      
      // === INITIALIZATION ===
      initialized: false,

      // === PERFORMANCE CACHE ===
      // Note: Cache moved outside of state to prevent infinite loops

      // ============================================================================
      // CONNECTION MANAGEMENT ACTIONS
      // ============================================================================

      /**
       * Check Canva connection status with caching
       */
      checkConnectionStatus: async (force = false) => {
        const state = get();
        
        // Skip if already checked recently and not forced
        if (state.connectionChecked && !force && !state.loading) {
          return { connected: state.connected, canva_user: state.user };
        }

        try {
          set(state => {
            state.loading = true;
            state.error = null;
          });

          const result = await canvaUtils.checkCanvaConnectionStatus(true);
          
          set(state => {
            state.connected = result.connected;
            state.user = result.canva_user;
            state.loading = false;
            state.connectionChecked = true;
            state.initialized = true;
            
            // Clear designs if disconnected
            if (!result.connected) {
              state.designs = [];
              state.designsLastFetched = null;
              state.savedDesigns.clear();
            }
          });

          console.log('[CanvaStore] Connection status checked:', { 
            connected: result.connected, 
            user: result.canva_user 
          });
          
          return result;

        } catch (error) {
          console.error('[CanvaStore] Error checking connection:', error);
          set(state => {
            state.connected = false;
            state.user = null;
            state.loading = false;
            state.error = error.message;
            state.connectionChecked = true;
            state.initialized = true;
          });
          throw error;
        }
      },

      /**
       * Initiate Canva login with loading state
       */
      initiateLogin: async () => {
        const state = get();
        if (state.loading) return;

        try {
          set(state => {
            state.loading = true;
            state.error = null;
          });

          await canvaUtils.initiateCanvaLogin((error) => {
            set(state => {
              state.error = error;
              state.loading = false;
            });
          });

        } catch (error) {
          set(state => {
            state.loading = false;
          });
          throw error;
        }
      },

      /**
       * Disconnect from Canva with cleanup
       */
      disconnect: async () => {
        try {
          set(state => {
            state.loading = true;
            state.error = null;
          });

          await canvaUtils.disconnectFromCanva(
            (message) => {
              set(state => {
                state.connected = false;
                state.user = null;
                state.designs = [];
                state.designsLastFetched = null;
                state.savedDesigns.clear();
                state.successMessage = message;
                state.loading = false;
              });
            },
            (error) => {
              set(state => {
                state.error = error;
                state.loading = false;
              });
            }
          );

        } catch (error) {
          set(state => {
            state.loading = false;
          });
          throw error;
        }
      },

      // ============================================================================
      // DESIGNS MANAGEMENT ACTIONS
      // ============================================================================

      /**
       * Fetch Canva designs with intelligent caching
       */
      fetchDesigns: async (force = false) => {
        const state = get();
        
        if (!state.connected) {
          console.log('[CanvaStore] Not connected, skipping designs fetch');
          return [];
        }

        // Check if we have fresh data and don't need to refetch
        const now = Date.now();
        const isStale = !state.designsLastFetched || 
                       (now - state.designsLastFetched) > state.designsStaleTime;
        
        if (!force && !isStale && state.designs.length > 0) {
          console.log('[CanvaStore] Using cached designs');
          return state.designs;
        }

        // Prevent concurrent fetches
        if (state.designsLoading) {
          console.log('[CanvaStore] Already fetching designs');
          return state.designs;
        }

        try {
          set(state => {
            state.designsLoading = true;
            state.designsError = null;
          });

          const designs = await canvaUtils.fetchCanvaDesigns(
            state.connected,
            true,
            0,
            2,
            (error) => {
              set(state => {
                state.designsError = error;
                if (error.includes('abgelaufen')) {
                  state.connected = false;
                  state.user = null;
                }
              });
            }
          );

          set(state => {
            state.designs = designs;
            state.designsLoading = false;
            state.designsLastFetched = now;
            state.designsError = null;
          });
          
          // Invalidate external filter cache when designs change
          filterCache = { cacheKey: null, result: [] };

          console.log(`[CanvaStore] Fetched ${designs.length} designs`);
          return designs;

        } catch (error) {
          set(state => {
            state.designsLoading = false;
            state.designs = [];
            state.designsError = error.message;
          });
          throw error;
        }
      },

      /**
       * Refresh designs cache (force refetch)
       */
      refreshDesigns: async () => {
        return get().fetchDesigns(true);
      },

      /**
       * Save Canva design as template with optimistic updates
       */
      saveTemplate: async (canvaDesign) => {
        if (!canvaDesign || !canvaDesign.canva_id) {
          throw new Error('Invalid Canva design');
        }

        try {
          // Optimistic update
          set(state => {
            state.savingDesign = canvaDesign.id;
            state.savedDesigns.add(canvaDesign.canva_id);
            state.error = null;
          });

          const result = await canvaUtils.saveCanvaTemplate(
            canvaDesign,
            (successMessage) => {
              set(state => {
                state.successMessage = successMessage;
                state.savingDesign = null;
              });
            },
            (errorMessage) => {
              // Handle "already saved" as success
              if (errorMessage.includes('bereits gespeichert')) {
                set(state => {
                  state.successMessage = 'Template bereits gespeichert.';
                  state.savingDesign = null;
                });
              } else {
                // Rollback optimistic update on real error
                set(state => {
                  state.savedDesigns.delete(canvaDesign.canva_id);
                  state.error = errorMessage;
                  state.savingDesign = null;
                });
              }
            }
          );

          return result;

        } catch (error) {
          // Rollback optimistic update
          set(state => {
            state.savedDesigns.delete(canvaDesign.canva_id);
            state.savingDesign = null;
          });
          throw error;
        }
      },

      /**
       * Check if design is currently being saved
       */
      isSavingDesign: (designId) => {
        return get().savingDesign === designId;
      },

      /**
       * Check if design has been saved as template
       */
      isDesignSaved: (canvaId) => {
        return get().savedDesigns.has(canvaId);
      },

      // ============================================================================
      // UI STATE MANAGEMENT
      // ============================================================================

      /**
       * Set active subsection
       */
      setActiveSubsection: (subsection) => set(state => {
        state.activeSubsection = subsection;
        state.error = null; // Clear errors on tab change
      }),

      /**
       * Set search query with debouncing for better performance
       */
      setSearchQuery: (query) => {
        set(state => {
          state.searchQuery = query;
        });
        
        // Invalidate external filter cache
        filterCache = { cacheKey: null, result: [] };
      },

      /**
       * Set debounced search query (called externally with debouncing)
       */
      setDebouncedSearchQuery: (query) => {
        set(state => {
          state.debouncedSearchQuery = query;
        });
        
        // Invalidate external filter cache
        filterCache = { cacheKey: null, result: [] };
      },

      /**
       * Set filter type
       */
      setFilterType: (type) => {
        set(state => {
          state.filterType = type;
        });
        
        // Invalidate external filter cache
        filterCache = { cacheKey: null, result: [] };
      },

      /**
       * Set sort order
       */
      setSortBy: (sortBy) => {
        set(state => {
          state.sortBy = sortBy;
        });
        
        // Invalidate external filter cache
        filterCache = { cacheKey: null, result: [] };
      },

      // ============================================================================
      // MESSAGE MANAGEMENT
      // ============================================================================

      /**
       * Set error message
       */
      setError: (error) => set(state => {
        state.error = error;
        state.successMessage = '';
      }),

      /**
       * Set success message
       */
      setSuccess: (message) => set(state => {
        state.successMessage = message;
        state.error = null;
      }),

      /**
       * Clear all messages
       */
      clearMessages: () => set(state => {
        state.error = null;
        state.successMessage = '';
      }),

      // ============================================================================
      // SELECTORS (Memoized for performance)
      // ============================================================================

      /**
       * Get filtered and sorted designs with performance optimizations
       * Fixed: No longer mutates Zustand state to prevent infinite loops
       */
      getFilteredDesigns: () => {
        const state = get();
        
        // Early return if no designs
        if (state.designs.length === 0) {
          filterCache = { cacheKey: null, result: [] };
          return [];
        }

        // Use external cache to prevent state mutations
        const cacheKey = `${state.debouncedSearchQuery}-${state.filterType}-${state.sortBy}-${state.designs.length}`;
        if (filterCache.cacheKey === cacheKey && filterCache.result.length > 0) {
          return filterCache.result;
        }

        let filtered = [...state.designs];

        // Apply search filter using debounced query
        if (state.debouncedSearchQuery.trim()) {
          const query = state.debouncedSearchQuery.toLowerCase();
          filtered = filtered.filter(design => {
            // Optimized search - check title first as it's most common
            if (design.title?.toLowerCase().includes(query)) {
              return true;
            }
            // Then check type
            if (design.type?.toLowerCase().includes(query)) {
              return true;
            }
            // Check other fields if needed
            if (design.owner?.display_name?.toLowerCase().includes(query)) {
              return true;
            }
            return false;
          });
        }

        // Apply type filter
        if (state.filterType !== 'all') {
          filtered = filtered.filter(design => design.type === state.filterType);
        }

        // Apply sorting with optimized comparisons
        if (filtered.length > 1) {
          filtered.sort((a, b) => {
            switch (state.sortBy) {
              case 'modified_descending':
                return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
              case 'modified_ascending':
                return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
              case 'created_descending':
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
              case 'created_ascending':
                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
              case 'title_ascending':
                return (a.title || '').localeCompare(b.title || '');
              case 'title_descending':
                return (b.title || '').localeCompare(a.title || '');
              default:
                return 0;
            }
          });
        }

        // Cache the result externally (no state mutation)
        filterCache = {
          cacheKey,
          result: filtered
        };

        return filtered;
      },

      /**
       * Get connection status summary
       */
      getConnectionStatus: () => {
        const state = get();
        return {
          connected: state.connected,
          user: state.user,
          loading: state.loading,
          checked: state.connectionChecked
        };
      },

      /**
       * Get designs status summary
       */
      getDesignsStatus: () => {
        const state = get();
        return {
          designs: state.designs,
          loading: state.designsLoading,
          error: state.designsError,
          lastFetched: state.designsLastFetched,
          count: state.designs.length
        };
      },

      /**
       * Check if designs cache is stale
       */
      isDesignsCacheStale: () => {
        const state = get();
        if (!state.designsLastFetched) return true;
        
        const now = Date.now();
        return (now - state.designsLastFetched) > state.designsStaleTime;
      },

      // ============================================================================
      // UTILITY METHODS
      // ============================================================================

      /**
       * Reset store to initial state
       */
      reset: () => {
        set(() => ({
          connected: false,
          user: null,
          loading: false,
          connectionChecked: false,
          designs: [],
          designsLoading: false,
          designsError: null,
          designsLastFetched: null,
          savedDesigns: new Set(),
          savingDesign: null,
          activeSubsection: 'overview',
          searchQuery: '',
          debouncedSearchQuery: '',
          filterType: 'all',
          sortBy: 'modified_descending',
          error: null,
          successMessage: '',
          initialized: false
        }));
        
        // Reset external filter cache
        filterCache = { cacheKey: null, result: [] };
      },

      /**
       * Initialize store (check connection and prefetch if connected)
       */
      initialize: async () => {
        const state = get();
        if (state.initialized) return;

        try {
          const connectionResult = await get().checkConnectionStatus();
          
          // If connected, prefetch designs
          if (connectionResult.connected) {
            await get().fetchDesigns();
          }
          
        } catch (error) {
          console.error('[CanvaStore] Initialization failed:', error);
        }
      },

      /**
       * Get debug information
       */
      getDebugInfo: () => {
        const state = get();
        return {
          connection: {
            connected: state.connected,
            user: state.user?.display_name || 'N/A',
            loading: state.loading,
            checked: state.connectionChecked
          },
          designs: {
            count: state.designs.length,
            loading: state.designsLoading,
            lastFetched: state.designsLastFetched 
              ? new Date(state.designsLastFetched).toLocaleString()
              : 'Never',
            isStale: get().isDesignsCacheStale()
          },
          ui: {
            activeSubsection: state.activeSubsection,
            searchQuery: state.searchQuery,
            filterType: state.filterType,
            sortBy: state.sortBy
          },
          messages: {
            error: state.error,
            success: state.successMessage
          }
        };
      }
    }))
  )
);

// ============================================================================
// MEMOIZED SELECTORS FOR PERFORMANCE
// ============================================================================

/**
 * Select connection status (memoized with individual selectors for stability)
 */
export const useCanvaConnection = () => {
  const connected = useCanvaStore(state => state.connected);
  const user = useCanvaStore(state => state.user);
  const loading = useCanvaStore(state => state.loading);
  const checked = useCanvaStore(state => state.connectionChecked);
  
  return { connected, user, loading, checked };
};

/**
 * Select designs with current filters (memoized with stable comparison)
 */
export const useCanvaDesigns = () => {
  const loading = useCanvaStore(state => state.designsLoading);
  const error = useCanvaStore(state => state.designsError);
  const lastFetched = useCanvaStore(state => state.designsLastFetched);
  const totalCount = useCanvaStore(state => state.designs.length);
  
  // FIXED: Use stable selector by directly accessing designs array
  const designs = useCanvaStore(
    state => state.designs, // Use raw designs array directly
    // Use shallow array equality
    (prev, next) => {
      if (prev.length !== next.length) return false;
      return prev.every((item, index) => item === next[index]); // Reference equality
    }
  );
  
  return { designs, loading, error, lastFetched, totalCount };
};

/**
 * Select UI state (memoized)
 */
export const useCanvaUI = () => useCanvaStore(
  state => ({
    activeSubsection: state.activeSubsection,
    searchQuery: state.searchQuery,
    debouncedSearchQuery: state.debouncedSearchQuery,
    filterType: state.filterType,
    sortBy: state.sortBy
  }),
  (a, b) => {
    // Optimized comparison - searchQuery changes frequently, so check it last
    return a.activeSubsection === b.activeSubsection &&
           a.filterType === b.filterType &&
           a.sortBy === b.sortBy &&
           a.debouncedSearchQuery === b.debouncedSearchQuery &&
           a.searchQuery === b.searchQuery;
  }
);

/**
 * Select search state only (for search input components)
 */
export const useCanvaSearch = () => {
  const searchQuery = useCanvaStore(state => state.searchQuery);
  const debouncedSearchQuery = useCanvaStore(state => state.debouncedSearchQuery);
  const setSearchQuery = useCanvaStore(state => state.setSearchQuery);
  const setDebouncedSearchQuery = useCanvaStore(state => state.setDebouncedSearchQuery);
  
  // Create debounced update function outside of store to prevent loops
  const debouncedUpdate = React.useCallback(
    debounce((query) => {
      setDebouncedSearchQuery(query);
    }, 300),
    [setDebouncedSearchQuery]
  );
  
  // Handle search with debouncing
  const handleSearch = React.useCallback((query) => {
    setSearchQuery(query);
    debouncedUpdate(query);
  }, [setSearchQuery, debouncedUpdate]);
  
  return {
    searchQuery,
    debouncedSearchQuery,
    isSearching: searchQuery !== debouncedSearchQuery,
    setSearchQuery: handleSearch
  };
};

/**
 * Select saving design state (stable selector for component usage)
 */
export const useSavingDesignState = () => {
  const savingDesign = useCanvaStore(state => state.savingDesign);
  const savedDesigns = useCanvaStore(state => state.savedDesigns);
  
  return { savingDesign, savedDesigns };
};

/**
 * Select messages (memoized)
 */
export const useCanvaMessages = () => useCanvaStore(
  state => ({
    error: state.error,
    success: state.successMessage
  })
);

export default useCanvaStore;