import {
  SlideEditor,
  SlidesProvider,
  createSlidesApiClient,
  useSlidesAdapter,
  usePresentationStore,
  type ExportFormat,
  type PresentationWithSlides,
} from '@gruenerator/slides';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

import { webAppSlidesAdapter } from './slidesAdapter';

function PresentationPageInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adapter = useSlidesAdapter();
  const apiClient = useMemo(() => createSlidesApiClient(adapter), [adapter]);
  const userId = useAuthStore((s) => s.user?.id);

  const {
    data: presentation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['presentation', id],
    queryFn: async () => {
      return apiClient.get<PresentationWithSlides>(`/presentations/${id}`);
    },
    enabled: !!id,
  });

  const canEdit = useMemo(() => {
    if (!presentation || !userId) return false;
    const permission = presentation.permissions[userId];
    return permission?.level === 'owner' || permission?.level === 'editor';
  }, [presentation, userId]);

  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!id) return;
      await apiClient.put(`/presentations/${id}`, { title });
    },
    [id, apiClient]
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!id) return;
      try {
        const blob = await apiClient.getBlob(`/presentations/${id}/export/${format}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${presentation?.title || 'Praesentation'}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export failed:', err);
      }
    },
    [id, apiClient, presentation?.title]
  );

  const handleBack = useCallback(() => {
    navigate('/docs');
  }, [navigate]);

  if (isLoading) {
    return <div className="min-h-screen" />;
  }

  if (error || !presentation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Präsentation nicht gefunden</h2>
          <button
            onClick={handleBack}
            className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600"
          >
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <SlideEditor
      presentation={presentation}
      editable={canEdit}
      onBack={handleBack}
      onTitleChange={handleTitleChange}
      onExport={handleExport}
    />
  );
}

export default function DocsPresentationPage() {
  return (
    <SlidesProvider adapter={webAppSlidesAdapter}>
      <PresentationPageInner />
    </SlidesProvider>
  );
}
