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
            const response = await apiClient.post('/auth/qa-collections', {
                name: collectionData.name,
                description: collectionData.description,
                custom_prompt: collectionData.custom_prompt,
                document_ids: collectionData.documents
            });

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
            const response = await apiClient.put(`/auth/qa-collections/${collectionId}`, {
                name: collectionData.name,
                description: collectionData.description,
                custom_prompt: collectionData.custom_prompt,
                document_ids: collectionData.documents
            });

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

    // Reset store
    reset: () => set({
        qaCollections: [],
        loading: false,
        error: null,
        selectedCollection: null
    })
}));

export default useQAStore;