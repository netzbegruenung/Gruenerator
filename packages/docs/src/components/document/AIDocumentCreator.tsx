import { AIPromptInput } from '@gruenerator/ui';
import { useCallback, useState } from 'react';

const EXAMPLE_PROMPTS = [
  { label: 'Pressemitteilung', text: 'Pressemitteilung zum Klimaschutz in unserer Kommune' },
  { label: 'Antrag', text: 'Antrag für den Kreisparteitag zum Thema nachhaltige Mobilität' },
  { label: 'Protokoll', text: 'Protokoll der letzten Vorstandssitzung' },
  { label: 'Einladung', text: 'Einladung zur nächsten Mitgliederversammlung' },
  { label: 'Redaktionsplan', text: 'Redaktionsplan für Social Media im nächsten Monat' },
];

interface AIDocumentCreatorProps {
  onGenerate: (description: string) => void;
  isLoading: boolean;
}

export const AIDocumentCreator = ({ onGenerate, isLoading }: AIDocumentCreatorProps) => {
  const [description, setDescription] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = description.trim();
    if (trimmed.length < 3 || isLoading) return;
    onGenerate(trimmed);
    setDescription('');
  }, [description, isLoading, onGenerate]);

  return (
    <AIPromptInput
      value={description}
      onChange={setDescription}
      onSubmit={handleSubmit}
      placeholder="Beschreibe, welches Dokument du erstellen möchtest…"
      isLoading={isLoading}
      examples={EXAMPLE_PROMPTS}
    />
  );
};
