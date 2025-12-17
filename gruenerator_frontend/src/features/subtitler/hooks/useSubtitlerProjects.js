import { useEffect, useCallback } from 'react';
import { useSubtitlerProjectStore } from '../../../stores/subtitlerProjectStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';

/**
 * Hook for managing subtitler projects with built-in auth guards.
 * Centralizes all project-related API calls and ensures they only
 * execute when the user is authenticated.
 */
export const useSubtitlerProjects = () => {
  const { isAuthenticated, isAuthResolved } = useOptimizedAuth();

  const {
    projects,
    currentProject,
    isLoading,
    isSaving,
    error,
    saveSuccess,
    initialFetchComplete,
    fetchProjects: storeFetchProjects,
    loadProject: storeLoadProject,
    saveProject: storeSaveProject,
    updateProject: storeUpdateProject,
    deleteProject: storeDeleteProject,
    setCurrentProject,
    clearCurrentProject,
    clearError,
    reset
  } = useSubtitlerProjectStore();

  const isReady = isAuthenticated && isAuthResolved;

  // Auto-fetch projects when auth is ready
  useEffect(() => {
    if (isReady) {
      storeFetchProjects();
    }
  }, [isReady, storeFetchProjects]);

  // Guarded fetch projects
  const fetchProjects = useCallback(async () => {
    if (!isReady) return Promise.resolve();
    return storeFetchProjects();
  }, [isReady, storeFetchProjects]);

  // Guarded load project
  const loadProject = useCallback(async (projectId) => {
    if (!isReady) return Promise.resolve(null);
    return storeLoadProject(projectId);
  }, [isReady, storeLoadProject]);

  // Guarded save project
  const saveProject = useCallback(async (projectData) => {
    if (!isReady) return Promise.resolve(null);
    return storeSaveProject(projectData);
  }, [isReady, storeSaveProject]);

  // Guarded update project
  const updateProject = useCallback(async (projectId, updates) => {
    if (!isReady) return Promise.resolve(null);
    return storeUpdateProject(projectId, updates);
  }, [isReady, storeUpdateProject]);

  // Guarded delete project
  const deleteProject = useCallback(async (projectId) => {
    if (!isReady) return Promise.resolve();
    return storeDeleteProject(projectId);
  }, [isReady, storeDeleteProject]);

  return {
    // State
    projects,
    currentProject,
    isLoading,
    isSaving,
    error,
    saveSuccess,
    isReady,
    initialFetchComplete,

    // Actions (all auth-guarded)
    fetchProjects,
    loadProject,
    saveProject,
    updateProject,
    deleteProject,

    // Direct store actions (no API calls)
    setCurrentProject,
    clearCurrentProject,
    clearError,
    reset
  };
};

export default useSubtitlerProjects;
