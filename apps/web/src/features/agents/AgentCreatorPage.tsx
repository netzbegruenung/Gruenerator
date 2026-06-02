import { type DraftedAgentSpec } from '@gruenerator/contracts';
import { useCallback, useState } from 'react';

import AgentBuilderForm from './AgentBuilderForm';
import { type FormState } from './agentFormState';
import AgentStartScreen from './AgentStartScreen';
import { useDraftAgent } from './api';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/** Map a synthesized draft into the wizard's form state. The fields the LLM
 *  doesn't pick (identifier, model/provider/params, tags, notebook) keep the
 *  form's EMPTY defaults. */
function specToFormState(spec: DraftedAgentSpec): Partial<FormState> {
  return {
    title: spec.title,
    description: spec.description,
    systemRole: spec.systemRole,
    iconKey: spec.iconKey,
    backgroundColor: spec.backgroundColor,
    locale: spec.locale === 'de-AT' ? 'de-AT' : 'de-DE',
    openingMessage: spec.openingMessage,
    openingQuestions: spec.openingQuestions.join('\n'),
    enabledTools: spec.enabledTools,
    skillMentions: spec.skillMentions,
  };
}

/**
 * Guided agent creator. A one-shot brief is drafted by the AI, then handed to
 * the same wizard the manual/edit routes use — pre-filled, never persisted
 * until the user saves. No chat (replaces the former conversational creator).
 */
function AgentCreatorPage() {
  const draftMut = useDraftAgent();
  const [description, setDescription] = useState('');
  const [initialState, setInitialState] = useState<Partial<FormState> | null>(null);
  const [phase, setPhase] = useState<'start' | 'build'>('start');
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle('Neuer Agent');

  const handleGenerate = useCallback(async () => {
    if (description.trim().length === 0) return;
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: description.trim() });
      setInitialState(specToFormState(spec));
      setPhase('build');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  }, [description, draftMut]);

  const handleManual = useCallback(() => {
    setInitialState(null);
    setPhase('build');
  }, []);

  const handleBack = useCallback(() => {
    setPhase('start');
  }, []);

  if (phase === 'build') {
    return (
      <PageContainer maxWidth="md" title="Neuer Agent">
        <div className="mx-auto max-w-3xl">
          <AgentBuilderForm initialState={initialState ?? undefined} onCancel={handleBack} />
        </div>
      </PageContainer>
    );
  }

  return (
    <AgentStartScreen
      aiDescription={description}
      onDescriptionChange={setDescription}
      onGenerateWithAI={() => void handleGenerate()}
      isLoading={draftMut.isPending}
      error={error}
      onManual={handleManual}
    />
  );
}

export default withAuthRequired(AgentCreatorPage, {
  title: 'Neuer Agent',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
