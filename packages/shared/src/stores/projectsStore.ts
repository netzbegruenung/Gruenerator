import { create, StateCreator } from 'zustand';
import type { Project, ProjectsState, ProjectsActions, SaveProjectData, UpdateProjectData } from '../projects/types';
import * as projectsApi from '../projects/api';

const DEFAULT_PROJECTS_STATE: ProjectsState = {
  projects: [],
  currentProject: null,
  isLoading: false,
  isSaving: false,
  error: null,
  saveSuccess: false,
  initialFetchComplete: false,
};

type ProjectsStore = ProjectsState & ProjectsActions;

const createProjectsStoreSlice: StateCreator<ProjectsStore> = (set, get) => ({
  ...DEFAULT_PROJECTS_STATE,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });

    try {
      const projects = await projectsApi.fetchProjects();
      set({
        projects,
        isLoading: false,
        initialFetchComplete: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Projekte konnten nicht geladen werden';
      console.error('[ProjectsStore] Failed to fetch projects:', error);
      set({
        error: errorMessage,
        isLoading: false,
        initialFetchComplete: true,
      });
    }
  },

  loadProject: async (projectId: string) => {
    set({ isLoading: true, error: null });

    try {
      const project = await projectsApi.getProject(projectId);
      set({
        currentProject: project,
        isLoading: false,
      });
      return project;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Projekt konnte nicht geladen werden';
      console.error('[ProjectsStore] Failed to load project:', error);
      set({
        error: errorMessage,
        isLoading: false,
      });
      throw error;
    }
  },

  saveProject: async (projectData: SaveProjectData) => {
    set({ isSaving: true, error: null, saveSuccess: false });

    try {
      const { project: newProject } = await projectsApi.saveProject(projectData);

      set((state) => ({
        projects: [newProject, ...state.projects.slice(0, 19)],
        currentProject: newProject,
        isSaving: false,
        saveSuccess: true,
      }));

      setTimeout(() => {
        set({ saveSuccess: false });
      }, 3000);

      return newProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Projekt konnte nicht gespeichert werden';
      console.error('[ProjectsStore] Failed to save project:', error);
      set({
        error: errorMessage,
        isSaving: false,
      });
      throw error;
    }
  },

  updateProject: async (projectId: string, updates: UpdateProjectData) => {
    set({ isSaving: true, error: null, saveSuccess: false });

    try {
      const updatedProject = await projectsApi.updateProject(projectId, updates);

      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? updatedProject : p)),
        currentProject: updatedProject,
        isSaving: false,
        saveSuccess: true,
      }));

      setTimeout(() => {
        set({ saveSuccess: false });
      }, 3000);

      return updatedProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Projekt konnte nicht aktualisiert werden';
      console.error('[ProjectsStore] Failed to update project:', error);
      set({
        error: errorMessage,
        isSaving: false,
      });
      throw error;
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      await projectsApi.deleteProject(projectId);

      set((state) => ({
        projects: state.projects.filter((p) => p.id !== projectId),
        currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Projekt konnte nicht gelöscht werden';
      console.error('[ProjectsStore] Failed to delete project:', error);
      set({ error: errorMessage });
      throw error;
    }
  },

  setCurrentProject: (project: Project | null) => {
    set({ currentProject: project });
  },

  clearCurrentProject: () => {
    set({ currentProject: null });
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(DEFAULT_PROJECTS_STATE);
  },
});

export const useProjectsStore = create<ProjectsStore>()(createProjectsStoreSlice);

export const getProjectsState = (): ProjectsState => {
  const { projects, currentProject, isLoading, isSaving, error, saveSuccess, initialFetchComplete } = useProjectsStore.getState();
  return { projects, currentProject, isLoading, isSaving, error, saveSuccess, initialFetchComplete };
};
