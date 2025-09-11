import { create } from 'zustand';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';

const useQAStore = create((set, get) => ({
    // State
    qaCollections: [],
    loading: false,
    error: null,
    selectedCollection: null,
    
    // Actions
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    
    // Fetch user's Q&A collections
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
                throw new Error(data.message || 'Failed to fetch Q&A collections');
            }

            set({ qaCollections: data.collections || [], loading: false });
        } catch (error) {
            console.error('Error fetching Q&A collections:', error);
            set({ error: error.message, loading: false });
        }
    },

    // Create new Q&A collection
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
                throw new Error(data.message || 'Failed to create Q&A collection');
            }

            // Refresh collections
            await get().fetchQACollections();
            set({ loading: false });
            
            return data.collection;
        } catch (error) {
            console.error('Error creating Q&A collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Update Q&A collection
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
                throw new Error(data.message || 'Failed to update Q&A collection');
            }

            // Refresh collections
            await get().fetchQACollections();
            set({ loading: false });
        } catch (error) {
            console.error('Error updating Q&A collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Delete Q&A collection
    deleteQACollection: async (collectionId) => {
        set({ loading: true, error: null });
        try {
            const response = await apiClient.delete(`/auth/qa-collections/${collectionId}`);

            const data = response.data;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to delete Q&A collection');
            }

            // Update local state
            set(state => ({
                qaCollections: state.qaCollections.filter(c => c.id !== collectionId),
                loading: false
            }));
        } catch (error) {
            console.error('Error deleting Q&A collection:', error);
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    // Get collection by ID
    getQACollection: (collectionId) => {
        const { qaCollections } = get();
        return qaCollections.find(c => c.id === collectionId);
    },

    // Set selected collection
    setSelectedCollection: (collection) => set({ selectedCollection: collection }),

    // Clear error
    clearError: () => set({ error: null }),

    // Get collection with enhanced data (includes selection mode and source info)
    getEnhancedCollection: (collectionId) => {
        const { qaCollections } = get();
        const collection = qaCollections.find(c => c.id === collectionId);
        
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
        const { qaCollections } = get();
        return qaCollections.filter(collection => {
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
        const { qaCollections } = get();
        
        const stats = {
            total: qaCollections.length,
            documentsOnly: 0,
            wolkeOnly: 0,
            mixed: 0,
            empty: 0
        };

        qaCollections.forEach(collection => {
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

    // Reset store
    reset: () => set({
        qaCollections: [],
        loading: false,
        error: null,
        selectedCollection: null
    })
}));

export default useQAStore;