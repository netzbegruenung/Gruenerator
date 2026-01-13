import React from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import * as canvaUtils from '../components/utils/canvaUtils';

interface CanvaUser {
  display_name?: string;
  [key: string]: unknown;
}

interface CanvaDesign {
  id: string;
  canva_id: string;
  title?: string;
  type?: string;
  updated_at?: string;
  created_at?: string;
  owner?: { display_name?: string };
  [key: string]: unknown;
}

interface CanvaStore {
  connected: boolean;
  user: CanvaUser | null;
  loading: boolean;
  connectionChecked: boolean;
  designs: CanvaDesign[];
  designsLoading: boolean;
  designsError: string | null;
  designsLastFetched: number | null;
  designsStaleTime: number;
  savedDesigns: Set<string>;
  savingDesign: string | null;
  activeSubsection: string;
  searchQuery: string;
  debouncedSearchQuery: string;
  filterType: string;
  sortBy: string;
  error: string | null;
  successMessage: string;
  initialized: boolean;
  checkConnectionStatus: (force?: boolean) => Promise<{ connected: boolean; canva_user: CanvaUser | null }>;
  initiateLogin: () => Promise<void>;
  disconnect: () => Promise<void>;
  fetchDesigns: (force?: boolean) => Promise<CanvaDesign[]>;
  refreshDesigns: () => Promise<CanvaDesign[]>;
  saveTemplate: (canvaDesign: CanvaDesign) => Promise<unknown>;
  isSavingDesign: (designId: string) => boolean;
  isDesignSaved: (canvaId: string) => boolean;
  setActiveSubsection: (subsection: string) => void;
  setSearchQuery: (query: string) => void;
  setDebouncedSearchQuery: (query: string) => void;
  setFilterType: (type: string) => void;
  setSortBy: (sortBy: string) => void;
  setError: (error: string | null) => void;
  setSuccess: (message: string) => void;
  clearMessages: () => void;
  getFilteredDesigns: () => CanvaDesign[];
  getConnectionStatus: () => { connected: boolean; user: CanvaUser | null; loading: boolean; checked: boolean };
  getDesignsStatus: () => { designs: CanvaDesign[]; loading: boolean; error: string | null; lastFetched: number | null; count: number };
  isDesignsCacheStale: () => boolean;
  reset: () => void;
  initialize: () => Promise<void>;
  getDebugInfo: () => { connection: Record<string, unknown>; designs: Record<string, unknown>; ui: Record<string, unknown>; messages: Record<string, unknown> };
}

const debounce = <T extends (...args: unknown[]) => void>(func: T, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

let filterCache: { cacheKey: string | null; result: CanvaDesign[] } = {
  cacheKey: null,
  result: []
};

export const useCanvaStore = create<CanvaStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      connected: false,
      user: null,
      loading: false,
      connectionChecked: false,
      designs: [],
      designsLoading: false,
      designsError: null,
      designsLastFetched: null,
      designsStaleTime: 5 * 60 * 1000,
      savedDesigns: new Set<string>(),
      savingDesign: null,
      activeSubsection: 'overview',
      searchQuery: '',
      debouncedSearchQuery: '',
      filterType: 'all',
      sortBy: 'modified_descending',
      error: null,
      successMessage: '',
      initialized: false,

      checkConnectionStatus: async (force = false) => {
        const state = get();
        if (state.connectionChecked && !force && !state.loading) {
          return { connected: state.connected, canva_user: state.user };
        }
        try {
          set(state => { state.loading = true; state.error = null; });
          const result = await canvaUtils.checkCanvaConnectionStatus(true);
          set(state => {
            state.connected = result.connected;
            state.user = result.canva_user;
            state.loading = false;
            state.connectionChecked = true;
            state.initialized = true;
            if (!result.connected) {
              state.designs = [];
              state.designsLastFetched = null;
              state.savedDesigns.clear();
            }
          });
          return result;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          set(state => {
            state.connected = false;
            state.user = null;
            state.loading = false;
            state.error = errorMessage;
            state.connectionChecked = true;
            state.initialized = true;
          });
          throw error;
        }
      },

      initiateLogin: async () => {
        const state = get();
        if (state.loading) return;
        try {
          set(state => { state.loading = true; state.error = null; });
          await canvaUtils.initiateCanvaLogin((error: string) => {
            set(state => { state.error = error; state.loading = false; });
          });
        } catch (error) {
          set(state => { state.loading = false; });
          throw error;
        }
      },

      disconnect: async () => {
        try {
          set(state => { state.loading = true; state.error = null; });
          await canvaUtils.disconnectFromCanva(
            (message: string) => {
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
            (error: string) => {
              set(state => { state.error = error; state.loading = false; });
            }
          );
        } catch (error) {
          set(state => { state.loading = false; });
          throw error;
        }
      },

      fetchDesigns: async (force = false) => {
        const state = get();
        if (!state.connected) return [];
        const now = Date.now();
        const isStale = !state.designsLastFetched || (now - state.designsLastFetched) > state.designsStaleTime;
        if (!force && !isStale && state.designs.length > 0) return state.designs;
        if (state.designsLoading) return state.designs;
        try {
          set(state => { state.designsLoading = true; state.designsError = null; });
          const designs = await canvaUtils.fetchCanvaDesigns(
            state.connected, true, 0, 2,
            (error: string) => {
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
          filterCache = { cacheKey: null, result: [] };
          return designs;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          set(state => {
            state.designsLoading = false;
            state.designs = [];
            state.designsError = errorMessage;
          });
          throw error;
        }
      },

      refreshDesigns: async () => get().fetchDesigns(true),

      saveTemplate: async (canvaDesign) => {
        if (!canvaDesign?.canva_id) throw new Error('Invalid Canva design');
        try {
          set(state => {
            state.savingDesign = canvaDesign.id;
            state.savedDesigns.add(canvaDesign.canva_id);
            state.error = null;
          });
          const result = await canvaUtils.saveCanvaTemplate(
            canvaDesign,
            (msg: string) => set(state => { state.successMessage = msg; state.savingDesign = null; }),
            (err: string) => {
              if (err.includes('bereits gespeichert')) {
                set(state => { state.successMessage = 'Template bereits gespeichert.'; state.savingDesign = null; });
              } else {
                set(state => {
                  state.savedDesigns.delete(canvaDesign.canva_id);
                  state.error = err;
                  state.savingDesign = null;
                });
              }
            }
          );
          return result;
        } catch (error) {
          set(state => { state.savedDesigns.delete(canvaDesign.canva_id); state.savingDesign = null; });
          throw error;
        }
      },

      isSavingDesign: (designId) => get().savingDesign === designId,
      isDesignSaved: (canvaId) => get().savedDesigns.has(canvaId),

      setActiveSubsection: (subsection) => set(state => { state.activeSubsection = subsection; state.error = null; }),
      setSearchQuery: (query) => { set(state => { state.searchQuery = query; }); filterCache = { cacheKey: null, result: [] }; },
      setDebouncedSearchQuery: (query) => { set(state => { state.debouncedSearchQuery = query; }); filterCache = { cacheKey: null, result: [] }; },
      setFilterType: (type) => { set(state => { state.filterType = type; }); filterCache = { cacheKey: null, result: [] }; },
      setSortBy: (sortBy) => { set(state => { state.sortBy = sortBy; }); filterCache = { cacheKey: null, result: [] }; },
      setError: (error) => set(state => { state.error = error; state.successMessage = ''; }),
      setSuccess: (message) => set(state => { state.successMessage = message; state.error = null; }),
      clearMessages: () => set(state => { state.error = null; state.successMessage = ''; }),

      getFilteredDesigns: () => {
        const state = get();
        if (state.designs.length === 0) { filterCache = { cacheKey: null, result: [] }; return []; }
        const cacheKey = `${state.debouncedSearchQuery}-${state.filterType}-${state.sortBy}-${state.designs.length}`;
        if (filterCache.cacheKey === cacheKey && filterCache.result.length > 0) return filterCache.result;
        let filtered = [...state.designs];
        if (state.debouncedSearchQuery.trim()) {
          const query = state.debouncedSearchQuery.toLowerCase();
          filtered = filtered.filter(d => d.title?.toLowerCase().includes(query) || d.type?.toLowerCase().includes(query) || d.owner?.display_name?.toLowerCase().includes(query));
        }
        if (state.filterType !== 'all') filtered = filtered.filter(d => d.type === state.filterType);
        if (filtered.length > 1) {
          filtered.sort((a, b) => {
            switch (state.sortBy) {
              case 'modified_descending': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
              case 'modified_ascending': return new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
              case 'created_descending': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              case 'created_ascending': return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
              case 'title_ascending': return (a.title || '').localeCompare(b.title || '');
              case 'title_descending': return (b.title || '').localeCompare(a.title || '');
              default: return 0;
            }
          });
        }
        filterCache = { cacheKey, result: filtered };
        return filtered;
      },

      getConnectionStatus: () => ({ connected: get().connected, user: get().user, loading: get().loading, checked: get().connectionChecked }),
      getDesignsStatus: () => ({ designs: get().designs, loading: get().designsLoading, error: get().designsError, lastFetched: get().designsLastFetched, count: get().designs.length }),
      isDesignsCacheStale: () => !get().designsLastFetched || (Date.now() - get().designsLastFetched!) > get().designsStaleTime,

      reset: () => {
        set(() => ({
          connected: false, user: null, loading: false, connectionChecked: false,
          designs: [], designsLoading: false, designsError: null, designsLastFetched: null,
          savedDesigns: new Set<string>(), savingDesign: null, activeSubsection: 'overview',
          searchQuery: '', debouncedSearchQuery: '', filterType: 'all', sortBy: 'modified_descending',
          error: null, successMessage: '', initialized: false
        }));
        filterCache = { cacheKey: null, result: [] };
      },

      initialize: async () => {
        if (get().initialized) return;
        try {
          const result = await get().checkConnectionStatus();
          if (result.connected) await get().fetchDesigns();
        } catch (error) { console.error('[CanvaStore] Initialization failed:', error); }
      },

      getDebugInfo: () => ({
        connection: { connected: get().connected, user: get().user?.display_name || 'N/A', loading: get().loading, checked: get().connectionChecked },
        designs: { count: get().designs.length, loading: get().designsLoading, lastFetched: get().designsLastFetched ? new Date(get().designsLastFetched!).toLocaleString() : 'Never', isStale: get().isDesignsCacheStale() },
        ui: { activeSubsection: get().activeSubsection, searchQuery: get().searchQuery, filterType: get().filterType, sortBy: get().sortBy },
        messages: { error: get().error, success: get().successMessage }
      })
    }))
  )
);

export const useCanvaConnection = () => ({
  connected: useCanvaStore(s => s.connected),
  user: useCanvaStore(s => s.user),
  loading: useCanvaStore(s => s.loading),
  checked: useCanvaStore(s => s.connectionChecked)
});

export const useCanvaDesigns = () => ({
  designs: useCanvaStore(s => s.designs),
  loading: useCanvaStore(s => s.designsLoading),
  error: useCanvaStore(s => s.designsError),
  lastFetched: useCanvaStore(s => s.designsLastFetched),
  totalCount: useCanvaStore(s => s.designs.length)
});

export const useCanvaUI = () => useCanvaStore(s => ({
  activeSubsection: s.activeSubsection,
  searchQuery: s.searchQuery,
  debouncedSearchQuery: s.debouncedSearchQuery,
  filterType: s.filterType,
  sortBy: s.sortBy
}));

export const useCanvaSearch = () => {
  const searchQuery = useCanvaStore(s => s.searchQuery);
  const debouncedSearchQuery = useCanvaStore(s => s.debouncedSearchQuery);
  const setSearchQuery = useCanvaStore(s => s.setSearchQuery);
  const setDebouncedSearchQuery = useCanvaStore(s => s.setDebouncedSearchQuery);
  const debouncedUpdate = React.useCallback(debounce((q: string) => setDebouncedSearchQuery(q), 300), [setDebouncedSearchQuery]);
  const handleSearch = React.useCallback((q: string) => { setSearchQuery(q); debouncedUpdate(q); }, [setSearchQuery, debouncedUpdate]);
  return { searchQuery, debouncedSearchQuery, isSearching: searchQuery !== debouncedSearchQuery, setSearchQuery: handleSearch };
};

export const useSavingDesignState = () => ({
  savingDesign: useCanvaStore(s => s.savingDesign),
  savedDesigns: useCanvaStore(s => s.savedDesigns)
});

export const useCanvaMessages = () => useCanvaStore(s => ({ error: s.error, success: s.successMessage }));

export default useCanvaStore;
