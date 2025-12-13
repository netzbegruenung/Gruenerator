import { create } from 'zustand';
import apiClient from '../components/utils/apiClient';

const initialState = {
    projects: [],
    currentProject: null,
    isLoading: false,
    isSaving: false,
    error: null,
    saveSuccess: false,
    initialFetchComplete: false
};

export const useSubtitlerProjectStore = create((set, get) => ({
    ...initialState,

    fetchProjects: async () => {
        set({ isLoading: true, error: null });

        try {
            const response = await apiClient.get('/subtitler/projects');

            if (response.data.success) {
                set({
                    projects: response.data.projects,
                    isLoading: false,
                    initialFetchComplete: true
                });
            } else {
                throw new Error(response.data.error || 'Failed to fetch projects');
            }
        } catch (error) {
            console.error('[SubtitlerProjectStore] Failed to fetch projects:', error);
            set({
                error: error.response?.data?.error || error.message || 'Projekte konnten nicht geladen werden',
                isLoading: false,
                initialFetchComplete: true
            });
        }
    },

    loadProject: async (projectId) => {
        set({ isLoading: true, error: null });

        try {
            const response = await apiClient.get(`/subtitler/projects/${projectId}`);

            if (response.data.success) {
                set({
                    currentProject: response.data.project,
                    isLoading: false
                });
                return response.data.project;
            } else {
                throw new Error(response.data.error || 'Failed to load project');
            }
        } catch (error) {
            console.error('[SubtitlerProjectStore] Failed to load project:', error);
            set({
                error: error.response?.data?.error || error.message || 'Projekt konnte nicht geladen werden',
                isLoading: false
            });
            throw error;
        }
    },

    saveProject: async (projectData) => {
        set({ isSaving: true, error: null, saveSuccess: false });

        try {
            const response = await apiClient.post('/subtitler/projects', projectData);

            if (response.data.success) {
                const newProject = response.data.project;

                set(state => ({
                    projects: [newProject, ...state.projects.slice(0, 19)],
                    currentProject: newProject,
                    isSaving: false,
                    saveSuccess: true
                }));

                setTimeout(() => {
                    set({ saveSuccess: false });
                }, 3000);

                return newProject;
            } else {
                throw new Error(response.data.error || 'Failed to save project');
            }
        } catch (error) {
            console.error('[SubtitlerProjectStore] Failed to save project:', error);
            set({
                error: error.response?.data?.error || error.message || 'Projekt konnte nicht gespeichert werden',
                isSaving: false
            });
            throw error;
        }
    },

    updateProject: async (projectId, updates) => {
        set({ isSaving: true, error: null, saveSuccess: false });

        try {
            const response = await apiClient.put(`/subtitler/projects/${projectId}`, updates);

            if (response.data.success) {
                const updatedProject = response.data.project;

                set(state => ({
                    projects: state.projects.map(p =>
                        p.id === projectId ? updatedProject : p
                    ),
                    currentProject: updatedProject,
                    isSaving: false,
                    saveSuccess: true
                }));

                setTimeout(() => {
                    set({ saveSuccess: false });
                }, 3000);

                return updatedProject;
            } else {
                throw new Error(response.data.error || 'Failed to update project');
            }
        } catch (error) {
            console.error('[SubtitlerProjectStore] Failed to update project:', error);
            set({
                error: error.response?.data?.error || error.message || 'Projekt konnte nicht aktualisiert werden',
                isSaving: false
            });
            throw error;
        }
    },

    deleteProject: async (projectId) => {
        try {
            const response = await apiClient.delete(`/subtitler/projects/${projectId}`);

            if (response.data.success) {
                set(state => ({
                    projects: state.projects.filter(p => p.id !== projectId),
                    currentProject: state.currentProject?.id === projectId ? null : state.currentProject
                }));
            } else {
                throw new Error(response.data.error || 'Failed to delete project');
            }
        } catch (error) {
            console.error('[SubtitlerProjectStore] Failed to delete project:', error);
            set({
                error: error.response?.data?.error || error.message || 'Projekt konnte nicht gelöscht werden'
            });
            throw error;
        }
    },

    setCurrentProject: (project) => {
        set({ currentProject: project });
    },

    clearCurrentProject: () => {
        set({ currentProject: null });
    },

    clearError: () => {
        set({ error: null });
    },

    reset: () => {
        set(initialState);
    }
}));

export default useSubtitlerProjectStore;
