import { create } from 'zustand';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';

const useNotebookStore = create((set, get) => ({
    // State
    notebookCollections: [],
    loading: false,
    error: null,
    selectedCollection: null,

    // Filter state
    filterValuesCache: {},  // { [collectionId]: { [field]: { label, values } } }
    activeFilters: {},      // { [collectionId]: { [field]: [value1, value2, ...] } }
    loadingFilters: {},     // { [collectionId]: boolean }

    // Actions
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    
    // Fetch user's Notebook collections
    fetchQACollections: async () => {
        const { isAuthenticated, user } = useAuthStore.getState();
        if (!isAuthenticated || !user) {
            set({ loading: false, error: 'Not authenticated' });
            return;
        }

        set({ loading: true, error: null });
        try {
            const response = await apiClient.get('/auth/qa-collections');
            const data = response.data;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch Notebook collections');
            }

            set({ notebookCollections: data.collections || [], loading: false });
        } catch (error) {
            console.error('Error fetching Notebook collections:', error);
            set({ error: error.message, loading: false });
        }
    },

    // Create new Notebook collection
    createQACollection: async (collectionData) => {
        set({ loading: true, error: null });
        try {
            const requestData = {
                name: collectionData.name,
                description: collectionData.description,
                custom_prompt: collectionData.custom_prompt,
                selection_mode: collectionData.selectionMode || 'documents'
            };

            // Add selection-specific data
            if (collectionData.selectionMode === 'wolke') {
                requestData.wolke_share_link_ids = collectionData.wolkeShareLinks || [];
            } else {
                requestData.document_ids = collectionData.documents || [];
            }

            const response = await apiClient.post('/auth/qa-collections', requestData);

            const data = response.data;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to create Notebook collection');
            }

            // Refresh collections
            await get().fetchQACollections();
            set({ loading: false });
            
            return data.collection;
        } catch (error) {
            console.error('Error creating Notebook collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Update Notebook collection
    updateQACollection: async (collectionId, collectionData) => {
        set({ loading: true, error: null });
        try {
            const requestData = {
                name: collectionData.name,
                description: collectionData.description,
                custom_prompt: collectionData.custom_prompt,
                selection_mode: collectionData.selectionMode || 'documents'
            };

            // Add selection-specific data
            if (collectionData.selectionMode === 'wolke') {
                requestData.wolke_share_link_ids = collectionData.wolkeShareLinks || [];
            } else {
                requestData.document_ids = collectionData.documents || [];
            }

            const response = await apiClient.put(`/auth/qa-collections/${collectionId}`, requestData);

            const data = response.data;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to update Notebook collection');
            }

            // Refresh collections
            await get().fetchQACollections();
            set({ loading: false });
        } catch (error) {
            console.error('Error updating Notebook collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Delete Notebook collection
    deleteQACollection: async (collectionId) => {
        set({ loading: true, error: null });
        try {
            const response = await apiClient.delete(`/auth/qa-collections/${collectionId}`);

            const data = response.data;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to delete Notebook collection');
            }

            // Update local state
            set(state => ({
                notebookCollections: state.notebookCollections.filter(c => c.id !== collectionId),
                loading: false
            }));
        } catch (error) {
            console.error('Error deleting Notebook collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Get collection by ID
    getQACollection: (collectionId) => {
        const { notebookCollections } = get();
        return notebookCollections.find(c => c.id === collectionId);
    },

    // Set selected collection
    setSelectedCollection: (collection) => set({ selectedCollection: collection }),

    // Clear error
    clearError: () => set({ error: null }),

    // Get collection with enhanced data (includes selection mode and source info)
    getEnhancedCollection: (collectionId) => {
        const { notebookCollections } = get();
        const collection = notebookCollections.find(c => c.id === collectionId);
        
        if (!collection) return null;

        // Enhance collection with computed properties
        return {
            ...collection,
            selection_mode: collection.selection_mode || 'documents',
            has_wolke_sources: (collection.wolke_share_links || []).length > 0,
            has_document_sources: (collection.documents || []).length > 0,
            total_sources: (collection.documents || []).length + (collection.wolke_share_links || []).length,
            is_mixed_sources: (collection.documents || []).length > 0 && (collection.wolke_share_links || []).length > 0
        };
    },

    // Get collections by source type
    getCollectionsBySourceType: (sourceType) => {
        const { notebookCollections } = get();
        return notebookCollections.filter(collection => {
            if (sourceType === 'documents') {
                return (collection.documents || []).length > 0 && !(collection.wolke_share_links || []).length;
            } else if (sourceType === 'wolke') {
                return (collection.wolke_share_links || []).length > 0 && !(collection.documents || []).length;
            } else if (sourceType === 'mixed') {
                return (collection.documents || []).length > 0 && (collection.wolke_share_links || []).length > 0;
            }
            return false;
        });
    },

    // Get statistics about collections
    getCollectionStats: () => {
        const { notebookCollections } = get();
        
        const stats = {
            total: notebookCollections.length,
            documentsOnly: 0,
            wolkeOnly: 0,
            mixed: 0,
            empty: 0
        };

        notebookCollections.forEach(collection => {
            const docCount = (collection.documents || []).length;
            const wolkeCount = (collection.wolke_share_links || []).length;

            if (docCount === 0 && wolkeCount === 0) {
                stats.empty++;
            } else if (docCount > 0 && wolkeCount > 0) {
                stats.mixed++;
            } else if (docCount > 0) {
                stats.documentsOnly++;
            } else {
                stats.wolkeOnly++;
            }
        });

        return stats;
    },

    // ─── Filter Actions ────────────────────────────────────────────────────

    fetchFilterValues: async (collectionId) => {
        const { filterValuesCache, loadingFilters } = get();

        if (filterValuesCache[collectionId] || loadingFilters[collectionId]) {
            return filterValuesCache[collectionId];
        }

        set(state => ({
            loadingFilters: { ...state.loadingFilters, [collectionId]: true }
        }));

        try {
            const response = await apiClient.get(`/auth/notebook/collections/${collectionId}/filters`);
            const data = response.data;

            if (data.filters) {
                set(state => ({
                    filterValuesCache: {
                        ...state.filterValuesCache,
                        [collectionId]: data.filters
                    },
                    loadingFilters: { ...state.loadingFilters, [collectionId]: false }
                }));
                return data.filters;
            }
        } catch (error) {
            console.error('[notebookStore] Error fetching filters:', collectionId, error);
        }

        set(state => ({
            loadingFilters: { ...state.loadingFilters, [collectionId]: false }
        }));
        return null;
    },

    setActiveFilter: (collectionId, field, value) => {
        set(state => {
            // Handle date range objects (for date_range filter type)
            if (value && typeof value === 'object' && ('date_from' in value || 'date_to' in value)) {
                // Filter out empty date values
                const hasDateFrom = value.date_from && value.date_from !== '';
                const hasDateTo = value.date_to && value.date_to !== '';

                if (!hasDateFrom && !hasDateTo) {
                    // Remove the filter entirely if both dates are empty
                    const { [field]: _, ...rest } = state.activeFilters[collectionId] || {};
                    return {
                        activeFilters: {
                            ...state.activeFilters,
                            [collectionId]: rest
                        }
                    };
                }

                return {
                    activeFilters: {
                        ...state.activeFilters,
                        [collectionId]: {
                            ...(state.activeFilters[collectionId] || {}),
                            [field]: {
                                date_from: hasDateFrom ? value.date_from : null,
                                date_to: hasDateTo ? value.date_to : null
                            }
                        }
                    }
                };
            }

            // Handle null value (clear filter)
            if (value === null) {
                const { [field]: _, ...rest } = state.activeFilters[collectionId] || {};
                return {
                    activeFilters: {
                        ...state.activeFilters,
                        [collectionId]: rest
                    }
                };
            }

            // Handle regular multi-select values (strings)
            const existing = state.activeFilters[collectionId]?.[field] || [];
            const newValues = existing.includes(value)
                ? existing.filter(v => v !== value)
                : [...existing, value];

            if (newValues.length === 0) {
                const { [field]: _, ...rest } = state.activeFilters[collectionId] || {};
                return {
                    activeFilters: {
                        ...state.activeFilters,
                        [collectionId]: rest
                    }
                };
            }

            return {
                activeFilters: {
                    ...state.activeFilters,
                    [collectionId]: {
                        ...(state.activeFilters[collectionId] || {}),
                        [field]: newValues
                    }
                }
            };
        });
    },

    removeActiveFilter: (collectionId, field, value) => {
        set(state => {
            const existing = state.activeFilters[collectionId]?.[field] || [];
            if (value !== undefined) {
                const newValues = existing.filter(v => v !== value);
                if (newValues.length === 0) {
                    const { [field]: _, ...rest } = state.activeFilters[collectionId] || {};
                    return {
                        activeFilters: {
                            ...state.activeFilters,
                            [collectionId]: rest
                        }
                    };
                }
                return {
                    activeFilters: {
                        ...state.activeFilters,
                        [collectionId]: {
                            ...(state.activeFilters[collectionId] || {}),
                            [field]: newValues
                        }
                    }
                };
            }

            const collectionFilters = { ...(state.activeFilters[collectionId] || {}) };
            delete collectionFilters[field];
            return {
                activeFilters: {
                    ...state.activeFilters,
                    [collectionId]: collectionFilters
                }
            };
        });
    },

    clearAllFilters: (collectionId) => {
        set(state => ({
            activeFilters: {
                ...state.activeFilters,
                [collectionId]: {}
            }
        }));
    },

    getFiltersForCollection: (collectionId) => {
        const { activeFilters } = get();
        return activeFilters[collectionId] || {};
    },

    getFilterValuesForCollection: (collectionId) => {
        const { filterValuesCache } = get();
        return filterValuesCache[collectionId] || null;
    },

    hasFiltersAvailable: (collectionId) => {
        const { filterValuesCache } = get();
        const filters = filterValuesCache[collectionId];
        return filters && Object.keys(filters).length > 0;
    },

    isLoadingFilters: (collectionId) => {
        const { loadingFilters } = get();
        return loadingFilters[collectionId] || false;
    },

    // Reset store
    reset: () => set({
        notebookCollections: [],
        loading: false,
        error: null,
        selectedCollection: null,
        filterValuesCache: {},
        activeFilters: {},
        loadingFilters: {}
    })
}));

export default useNotebookStore;