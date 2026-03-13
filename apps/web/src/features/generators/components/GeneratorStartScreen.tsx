import React, { memo, useCallback, useMemo, useState } from 'react';

import PromptInput from '../../../components/common/PromptInput/PromptInput';

import GeneratorDetailPanel from './GeneratorDetailPanel';

import type { PromptExample } from '../../../components/common/PromptInput/PromptInput';

import { cn } from '@/utils/cn';

const sectionHeaderClasses =
  'text-xs text-foreground-muted uppercase tracking-wide mb-sm font-semibold m-0';

interface GeneratorListItem {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  description?: string;
  prompt?: string;
  contact_email?: string;
  form_schema?: Record<string, unknown>;
  usage_count?: number;
  created_at?: string;
  owner_first_name?: string;
  owner_last_name?: string;
}

interface GeneratorStartScreenProps {
  aiDescription: string;
  onDescriptionChange: (value: string) => void;
  onGenerateWithAI: () => void;
  isLoading: boolean;
  error?: string | null;
  generators?: GeneratorListItem[];
  savedGenerators?: GeneratorListItem[];
  onSelectGenerator?: (generator: GeneratorListItem) => void;
  onDeleteGenerator?: () => void;
  onGeneratorUpdated?: () => void;
}

const EXAMPLE_PROMPTS: PromptExample[] = [
  {
    label: '📰 Pressemitteilung',
    text: 'Erstelle einen Grünerator für Pressemitteilungen über neu eröffnete Radwege. Er soll nach dem Ort, der Länge des Radwegs und besonderen Merkmalen fragen.',
  },
  {
    label: '📱 Social Media',
    text: 'Ich brauche einen Grünerator für Social-Media-Posts (Instagram, Facebook) mit kurzen Klimaschutz-Tipps für den Alltag. Er soll nach der Zielgruppe (z.B. Studierende, Familien) fragen.',
  },
  {
    label: '📣 Ankündigung',
    text: 'Entwickle einen Grünerator, der Ankündigungen für Bürgerversammlungen zu Umweltthemen erstellt. Er soll nach dem Thema, Datum, Uhrzeit und Ort der Versammlung fragen.',
  },
];

const GeneratorStartScreen: React.FC<GeneratorStartScreenProps> = memo(
  ({
    aiDescription,
    onDescriptionChange,
    onGenerateWithAI,
    isLoading,
    error,
    generators = [],
    savedGenerators = [],
    onSelectGenerator,
    onDeleteGenerator,
    onGeneratorUpdated,
  }) => {
    const [selectedGeneratorId, setSelectedGeneratorId] = useState<string | null>(null);

    const hasGenerators = useMemo(
      () => generators.length > 0 || savedGenerators.length > 0,
      [generators.length, savedGenerators.length]
    );

    const handleOwnedGeneratorClick = useCallback((generator: GeneratorListItem) => {
      setSelectedGeneratorId((prev) => (prev === generator.id ? null : generator.id));
    }, []);

    const handleOpenGenerator = useCallback((generator: GeneratorListItem) => {
      window.open(`/gruenerator/${generator.slug}`, '_blank');
    }, []);

    const handleDeleted = useCallback(() => {
      setSelectedGeneratorId(null);
      onDeleteGenerator?.();
    }, [onDeleteGenerator]);

    const handleUpdated = useCallback(() => {
      onGeneratorUpdated?.();
    }, [onGeneratorUpdated]);

    return (
      <div className="w-full max-w-[800px] mx-auto px-md max-md:px-sm">
        <div className="flex flex-col gap-lg">
          <PromptInput
            value={aiDescription}
            onChange={onDescriptionChange}
            onSubmit={onGenerateWithAI}
            placeholder="Beschreibe deinen neuen Grünerator..."
            isLoading={isLoading}
            error={error}
            examples={EXAMPLE_PROMPTS}
            minRows={2}
            submitLabel="Grünerator erstellen"
          />

          {hasGenerators && (
            <div className="flex flex-col gap-md border-t border-grey-200 dark:border-grey-700 pt-lg">
              {generators.length > 0 && (
                <div>
                  <h4 className={sectionHeaderClasses}>Meine Grüneratoren</h4>
                  <div className="flex flex-col flex-nowrap">
                    {generators.map((gen) => (
                      <div key={gen.id} className="flex flex-col">
                        <button
                          className={cn(
                            'inline-flex items-center gap-xs px-4 py-2 bg-background-alt border border-grey-200 dark:border-grey-700 rounded-lg cursor-pointer transition-all duration-200 text-left text-foreground text-sm font-medium whitespace-nowrap hover:bg-background-pure hover:border-primary-500 mb-xs',
                            selectedGeneratorId === gen.id &&
                              'bg-background-pure border-primary-500 shadow-sm rounded-b-none mb-0'
                          )}
                          onClick={() => handleOwnedGeneratorClick(gen)}
                          type="button"
                        >
                          {gen.name || gen.title}
                        </button>
                        {selectedGeneratorId === gen.id && (
                          <GeneratorDetailPanel
                            generator={gen}
                            onOpen={handleOpenGenerator}
                            onDeleted={handleDeleted}
                            onUpdated={handleUpdated}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {savedGenerators.length > 0 && (
                <div>
                  <h4 className={sectionHeaderClasses}>Gespeichert</h4>
                  <div className="flex flex-wrap gap-sm max-md:flex-nowrap max-md:overflow-x-auto max-md:gap-xs">
                    {savedGenerators.map((gen) => (
                      <button
                        key={gen.id}
                        className="inline-flex items-center gap-xs px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-full cursor-pointer transition-all duration-200 text-left text-foreground text-sm font-medium whitespace-nowrap hover:border-amber-400 dark:hover:border-amber-500 max-md:px-3 max-md:py-1.5 max-md:text-[0.85rem] max-md:shrink-0"
                        onClick={() => onSelectGenerator?.(gen)}
                        type="button"
                      >
                        {gen.name || gen.title}
                        {gen.owner_first_name && (
                          <span className="text-[0.8rem] text-grey-400 font-normal">
                            · {gen.owner_first_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

GeneratorStartScreen.displayName = 'GeneratorStartScreen';

export default GeneratorStartScreen;
