import { AIPromptInput, type AIPromptInputExample, Button, SectionHeader } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';

import AgentCard from './AgentCard';
import { useUserAgents } from './api';

import PageContainer from '@/components/common/PageContainer';

interface AgentStartScreenProps {
  aiDescription: string;
  onDescriptionChange: (value: string) => void;
  onGenerateWithAI: () => void;
  isLoading: boolean;
  error?: string | null;
  /** Skip the AI draft and open an empty wizard. */
  onManual: () => void;
}

const EXAMPLE_PROMPTS: AIPromptInputExample[] = [
  {
    label: '📰 Pressestelle',
    text: 'Ein Agent für Pressemitteilungen meines Kreisverbands. Freundlicher, professioneller Ton, soll auch im Web recherchieren können.',
  },
  {
    label: '🚲 Recherche-Bot',
    text: 'Ein Recherche-Bot für Verkehrs- und Mobilitätsthemen, der Quellen aus dem Web zusammenfasst und einordnet.',
  },
  {
    label: '📣 Social Media',
    text: 'Ein Agent für kurze Social-Media-Posts zu Klimaschutz im Alltag, der nach der Zielgruppe fragt.',
  },
];

/**
 * Entry screen of the guided agent creator: describe the agent in one brief,
 * the AI drafts it, and a card grid of the user's existing agents lives below.
 */
function AgentStartScreen({
  aiDescription,
  onDescriptionChange,
  onGenerateWithAI,
  isLoading,
  error,
  onManual,
}: AgentStartScreenProps) {
  const { data: agents = [] } = useUserAgents();

  return (
    <PageContainer
      maxWidth="md"
      title="Was für einen Agent möchtest du bauen?"
      subtitle="Beschreibe Zweck, Ton und Fähigkeiten — daraus entsteht ein Entwurf, den du vor dem Anlegen noch anpassen kannst."
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-sm">
        <AIPromptInput
          useDictation={useVoxtralDictation}
          value={aiDescription}
          onChange={onDescriptionChange}
          onSubmit={onGenerateWithAI}
          placeholder="Beschreibe deinen neuen Agent..."
          isLoading={isLoading}
          error={error}
          examples={EXAMPLE_PROMPTS}
          rows={2}
        />
        <div className="text-center">
          <Button variant="link" size="sm" onClick={onManual}>
            Lieber manuell anlegen?
          </Button>
        </div>
      </div>

      {agents.length > 0 && (
        <section className="mx-auto mt-xl w-full max-w-3xl">
          <SectionHeader title="Meine Agenten" />
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            {agents.map((agent) => (
              <AgentCard key={agent.identifier} agent={agent} />
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}

export default AgentStartScreen;
