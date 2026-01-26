import React, { memo, useCallback, useMemo } from 'react';

import FormCard from '../../../components/common/Form/BaseForm/FormCard';
import PromptInput from '../../../components/common/PromptInput/PromptInput';

import type { PromptExample } from '../../../components/common/PromptInput/PromptInput';
import './GeneratorStartScreen.css';

interface GeneratorListItem {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  description?: string;
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
  }) => {
    const hasGenerators = useMemo(
      () => generators.length > 0 || savedGenerators.length > 0,
      [generators.length, savedGenerators.length]
    );

    return (
      <div className="create-generator-wrapper">
        <FormCard
          title="Eigene Grüneratoren"
          subtitle="Erstelle neue oder nutze bestehende"
          size="large"
          variant="elevated"
          hover={false}
        >
          <div className="create-generator-content">
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
              <div className="generator-list">
                {generators.length > 0 && (
                  <div className="generator-list-section">
                    <h4>Meine Grüneratoren</h4>
                    <div className="generator-list-items">
                      {generators.map((gen) => (
                        <button
                          key={gen.id}
                          className="generator-list-item"
                          onClick={() => onSelectGenerator?.(gen)}
                          type="button"
                        >
                          {gen.name || gen.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {savedGenerators.length > 0 && (
                  <div className="generator-list-section">
                    <h4>Gespeichert</h4>
                    <div className="generator-list-items">
                      {savedGenerators.map((gen) => (
                        <button
                          key={gen.id}
                          className="generator-list-item generator-list-item--saved"
                          onClick={() => onSelectGenerator?.(gen)}
                          type="button"
                        >
                          <span className="generator-list-item-name">
                            {gen.name || gen.title}
                            {gen.owner_first_name && (
                              <span className="generator-list-item-owner">
                                · {gen.owner_first_name}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </FormCard>
      </div>
    );
  }
);

GeneratorStartScreen.displayName = 'GeneratorStartScreen';

export default GeneratorStartScreen;
