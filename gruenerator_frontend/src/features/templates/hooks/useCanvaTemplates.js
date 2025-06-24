import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Hook zum Verwalten von Canva-Vorlagen eines Nutzers
export const useCanvaTemplates = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // --- Fetch Available Categories ---
  const fetchAvailableCategories = async () => {
    const response = await fetch(`${AUTH_BASE_URL}/auth/template-categories`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch categories' }));
      throw new Error(error.message || 'Fehler beim Laden der Kategorien');
    }

    const data = await response.json();
    return data.categories?.map(cat => ({ value: cat.id, label: cat.label })) || [];
  };

  // --- Fetch Available Tags ---
  const fetchAvailableTags = async () => {
    const response = await fetch(`${AUTH_BASE_URL}/auth/template-tags`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch tags' }));
      throw new Error(error.message || 'Fehler beim Laden der Tags');
    }

    const data = await response.json();
    return data.tags?.map(tag => ({ value: tag.id, label: tag.name })) || [];
  };

  // --- Fetch Canva Templates ---
  const fetchCanvaTemplates = async (userId) => {
    const url = new URL(`${AUTH_BASE_URL}/auth/canva-templates`);
    if (userId) {
      url.searchParams.append('userId', userId);
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch templates' }));
      throw new Error(error.message || 'Fehler beim Laden der Vorlagen');
    }

    const data = await response.json();
    return data.templates || [];
  };

  // --- Create Canva Template ---
  const createCanvaTemplate = async (templateData) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/canva-templates`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create template' }));
      throw new Error(error.message || 'Fehler beim Erstellen der Vorlage');
    }

    return await response.json();
  };
  
  // --- Update Canva Template ---
  const updateCanvaTemplate = async ({ templateId, templateData }) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/canva-templates/${templateId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update template' }));
      throw new Error(error.message || 'Fehler beim Aktualisieren der Vorlage');
    }

    return await response.json();
  };

  // --- Delete Canva Template ---
  const deleteCanvaTemplate = async (templateId) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/canva-templates/${templateId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete template' }));
      throw new Error(error.message || 'Fehler beim Löschen der Vorlage');
    }

    return templateId;
  };

  // --- React Query Mutations ---
  const createMutation = useMutation({
    mutationFn: createCanvaTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', user?.id] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateCanvaTemplate,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['canvaTemplate', variables.templateId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ templateId }) => deleteCanvaTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', user?.id] });
    },
  });
  
  return {
    fetchCanvaTemplates,
    fetchAvailableCategories,
    fetchAvailableTags,
    
    createCanvaTemplate: createMutation.mutate,
    isCreatingCanvaTemplate: createMutation.isPending,
    createCanvaTemplateError: createMutation.error,
    
    updateCanvaTemplate: updateMutation.mutate,
    isUpdatingCanvaTemplate: updateMutation.isPending,
    updateCanvaTemplateError: updateMutation.error,

    deleteCanvaTemplate: deleteMutation.mutate,
    isDeletingCanvaTemplate: deleteMutation.isPending,
    deleteCanvaTemplateError: deleteMutation.error,
  };
};