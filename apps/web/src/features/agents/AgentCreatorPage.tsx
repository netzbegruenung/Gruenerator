import { type DraftedAgentSpec } from '@gruenerator/contracts';
import { useCallback, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import AgentEditor from './AgentEditor';
import { EMPTY_FORM, type FormState } from './agentFormState';
import AgentStartScreen from './AgentStartScreen';
import { useDraftAgent } from './api';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
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
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const variant = searchParams.get('mode') === 'recurring' ? 'recurring' : 'agent';
  // Prefill from "Texte anlernen" → "Als Grünerator anlegen": jump straight into
  // the build wizard with the learned style as the systemRole.
  const prefillTextForm = (
    location.state as { prefillTextForm?: { title: string; systemRole: string } } | null
  )?.prefillTextForm;
  const [description, setDescription] = useState('');
  const [initialState, setInitialState] = useState<Partial<FormState> | null>(
    prefillTextForm
      ? { title: prefillTextForm.title, systemRole: prefillTextForm.systemRole }
      : null
  );
  const [phase, setPhase] = useState<'start' | 'build'>(prefillTextForm ? 'build' : 'start');
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(variant === 'recurring' ? 'Neue wiederkehrende Aufgabe' : 'Neuer Grünerator');

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
      <AgentEditor
        mode="create"
        initialState={{ ...EMPTY_FORM, ...initialState }}
        variant={variant}
        onCancel={handleBack}
      />
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
  title: 'Neuer Grünerator',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
