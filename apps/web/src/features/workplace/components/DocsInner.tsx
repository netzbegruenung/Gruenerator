import { DocsProvider, useGenerateDocument } from '@gruenerator/docs';
import { AIPromptInput, type AIPromptInputExample } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';
import React, { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import FeatureIcons from '../../../components/common/FeatureIcons';
import { webAppDocsAdapter } from '../../docs/docsAdapter';

const PLACEHOLDER = 'Beschreibe das Dokument, das die KI für dich erstellen soll...';

const EXAMPLES: AIPromptInputExample[] = [
  {
    label: 'Konzeptpapier Wärmewende',
    text: 'Konzeptpapier für unsere kommunale Wärmewende: Ausgangslage, Ziele bis 2032, vier Maßnahmenfelder (Wärmenetz, Sanierungsoffensive, Förderung, Beratung), Finanzierung und nächste Schritte. Mit Gliederung und Quellenhinweisen.',
  },
  {
    label: 'Positionspapier Verkehr',
    text: 'Positionspapier zur Verkehrswende vor Ort: zehn konkrete Forderungen, sortiert nach Aufwand und Wirkung. Pro Forderung ein Absatz mit Begründung und Beispielen aus anderen Kommunen.',
  },
  {
    label: 'Gesprächsleitfaden Haustür',
    text: 'Gesprächsleitfaden für den Haustürwahlkampf zur Kommunalwahl 2026: Einstieg, drei Kernthemen (Wohnen, Klima, Mobilität), Antworten auf typische Einwände, Abschluss mit Mobilisierung zur Wahl.',
  },
];

const DocsPromptInput: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const generateDoc = useGenerateDocument();

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || generateDoc.isPending) return;

    generateDoc.mutate(trimmed, {
      onSuccess: (data) => {
        void navigate(`/docs/${data.id}`);
      },
    });
  }, [prompt, generateDoc, navigate]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  return (
    <AIPromptInput
      value={prompt}
      onChange={setPrompt}
      onSubmit={onSubmit}
      isLoading={generateDoc.isPending}
      error={generateDoc.error ? String(generateDoc.error) : null}
      placeholder={PLACEHOLDER}
      examples={EXAMPLES}
      toolbar={<FeatureIcons noBorder />}
    />
  );
};

const DocsInner: React.FC = memo(() => (
  <DocsProvider adapter={webAppDocsAdapter}>
    <DocsPromptInput />
  </DocsProvider>
));

DocsInner.displayName = 'DocsInner';

export default DocsInner;
