import { Button } from '@gruenerator/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useMemo, memo } from 'react';
import { useParams } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { cn } from '../../utils/cn';
import GeneratorInner from '../texte/components/GeneratorInner';

import { configToModeDefinition } from './utils/configToMode';

import type { GeneratorConfig } from './types/generatorTypes';

const QUERY_KEYS = {
  generator: (slug: string | undefined) => ['customGenerator', slug] as const,
};

function useCustomGenerator(slug: string | undefined) {
  const { isAuthenticated } = useOptimizedAuth();

  return useQuery<GeneratorConfig>({
    queryKey: QUERY_KEYS.generator(slug),
    queryFn: async () => {
      const response = await apiClient.get(`/custom_generator/${slug}`);
      const data = response.data;
      return data.generator || data;
    },
    enabled: !!slug && isAuthenticated,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

const CustomGeneratorPage: React.FC = memo(() => {
  const { slug } = useParams<{ slug: string }>();
  const { data: config, isLoading, error } = useCustomGenerator(slug);

  const isOwner = config?.is_owner ?? false;

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/auth/saved_generators/${config!.id}`);
    },
  });
  const isSaved = saveMutation.isSuccess || (config?.is_saved ?? false);

  const modeDef = useMemo(() => (config ? configToModeDefinition(config) : null), [config]);

  if (isLoading)
    return <div className="flex justify-center items-center min-h-[300px]">Lade...</div>;
  if (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    const message =
      status === 404 ? 'Generator nicht gefunden.' : 'Fehler beim Laden des Generators.';
    return (
      <div className="flex justify-center items-center min-h-[300px] text-red-500">{message}</div>
    );
  }
  if (!config || !modeDef)
    return (
      <div className="flex justify-center items-center min-h-[300px]">Generator nicht gefunden</div>
    );

  return (
    <ErrorBoundary>
      <div className="flex flex-col items-center justify-start w-full max-w-[48rem] mx-auto px-md py-lg gap-md">
        <div className="flex items-center justify-between w-full">
          <h1 className="text-2xl font-semibold text-foreground m-0">
            {config.name || config.title}
          </h1>
          {!isOwner && (
            <Button
              type="button"
              variant="brand"
              size="brand-sm"
              className={cn(isSaved && 'opacity-70')}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || isSaved}
              title={isSaved ? 'Bereits gespeichert' : 'In meinem Profil speichern'}
            >
              {saveMutation.isPending ? 'Speichern...' : isSaved ? 'Gespeichert' : 'Speichern'}
            </Button>
          )}
        </div>

        {config.description && (
          <p className="text-grey-500 text-sm w-full m-0">{config.description}</p>
        )}

        <GeneratorInner def={modeDef} />
      </div>
    </ErrorBoundary>
  );
});

CustomGeneratorPage.displayName = 'CustomGeneratorPage';

export default CustomGeneratorPage;
