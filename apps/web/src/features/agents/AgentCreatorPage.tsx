import { GrueneratorThread, useAgentStore } from '@gruenerator/chat';
import { type DraftedAgentSpec } from '@gruenerator/contracts';
import { getAgentSlug, USER_SELECTABLE_TOOLS } from '@gruenerator/shared/agents';
import { slugifyName, generateSlugSuffix } from '@gruenerator/shared/utils';
import { useCallback, useEffect, useState } from 'react';
import { PiArrowRight, PiPencilSimple, PiSparkle, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { useCreateUserAgent, useDraftAgent, type UserAgentInput } from './api';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useFirstName } from '@/hooks/useFirstName';
import { useAuthStore } from '@/stores/authStore';

const CREATOR_AGENT_ID = 'gruenerator-agent-creator';

const TOOL_LABELS = new Map(USER_SELECTABLE_TOOLS.map((t) => [t.key, t.label]));

/** Map a synthesized draft into the create payload. Identifier, model/provider
 *  defaults and the notebook binding are filled in here (the LLM doesn't pick
 *  them); the notebook can be added later via the editor. */
function specToInput(spec: DraftedAgentSpec): UserAgentInput {
  return {
    identifier: `${slugifyName(spec.title, 'agent')}-${generateSlugSuffix()}`,
    title: spec.title,
    description: spec.description,
    systemRole: spec.systemRole,
    avatar: spec.avatar,
    backgroundColor: spec.backgroundColor,
    tags: [],
    model: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.6 },
    openingMessage: spec.openingMessage,
    openingQuestions: spec.openingQuestions,
    locale: spec.locale,
    author: 'Eigene*r Agent*in',
    enabledTools: spec.enabledTools,
    skillMentions: spec.skillMentions,
  };
}

function DraftPanel({ spec, onDismiss }: { spec: DraftedAgentSpec; onDismiss: () => void }) {
  const navigate = useNavigate();
  const createMut = useCreateUserAgent();
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (destination: 'chat' | 'edit') => {
      setError(null);
      try {
        const agent = await createMut.mutateAsync(specToInput(spec));
        if (destination === 'edit') {
          void navigate(`/agents/${agent.identifier}/edit`);
        } else {
          void navigate(`/agents/${getAgentSlug(agent.identifier)}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen.');
      }
    },
    [createMut, navigate, spec]
  );

  const toolLabels = spec.enabledTools.map((k) => TOOL_LABELS.get(k) ?? k);

  return (
    <div className="border-t border-grey-200 bg-background-alt p-md dark:border-grey-700">
      <div className="mx-auto flex max-w-2xl flex-col gap-sm">
        <div className="flex items-start gap-sm">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: spec.backgroundColor }}
          >
            {spec.avatar}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground-heading">
              {spec.title}
            </h2>
            <p className="text-sm text-foreground-muted">{spec.description}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Entwurf verwerfen"
            className="shrink-0 rounded-md p-1.5 text-grey-500 hover:bg-hover-alt"
          >
            <PiX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
          {toolLabels.length > 0 && (
            <span>
              Fähigkeiten: <span className="text-foreground">{toolLabels.join(', ')}</span>
            </span>
          )}
          {spec.skillMentions.length > 0 && (
            <span>
              Skills:{' '}
              <span className="text-foreground">
                {spec.skillMentions.map((m) => `@${m}`).join(', ')}
              </span>
            </span>
          )}
          <span>
            Region: <span className="text-foreground">{spec.locale}</span>
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={() => void create('chat')}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-md py-sm text-sm text-white hover:bg-primary-700 disabled:opacity-60"
          >
            <PiSparkle className="h-4 w-4" />
            Agent*in erstellen
            <PiArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void create('edit')}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-grey-300 px-md py-sm text-sm hover:bg-hover-alt disabled:opacity-60 dark:border-grey-700"
          >
            <PiPencilSimple className="h-4 w-4" />
            Anpassen
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentCreatorPage() {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const draftMut = useDraftAgent();
  const [draft, setDraft] = useState<DraftedAgentSpec | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useDocumentTitle('Neue*r Agent*in');

  useEffect(() => {
    const store = useAgentStore.getState();
    store.setSelectedAgent(CREATOR_AGENT_ID);
    store.setChatViewMode('thread');
  }, []);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const handleDraft = useCallback(async () => {
    if (!currentThreadId) return;
    setDraftError(null);
    try {
      const spec = await draftMut.mutateAsync(currentThreadId);
      setDraft(spec);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  }, [currentThreadId, draftMut]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <main className="flex min-h-0 flex-1 flex-col">
        <GrueneratorThread
          onNavigate={handleNavigate}
          firstName={firstName}
          requireProfileHydration
          userLocale={userLocale}
        />
      </main>

      {draft ? (
        <DraftPanel spec={draft} onDismiss={() => setDraft(null)} />
      ) : (
        <div className="border-t border-grey-200 bg-background p-sm dark:border-grey-700">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-sm">
            <p className="text-xs text-foreground-muted">
              Wenn ihr genug besprochen habt, erstelle ich daraus einen Entwurf.
            </p>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => void handleDraft()}
                disabled={!currentThreadId || draftMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-md py-sm text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                title={!currentThreadId ? 'Starte zuerst die Unterhaltung' : undefined}
              >
                <PiSparkle className="h-4 w-4" />
                {draftMut.isPending ? 'Erstelle Entwurf…' : 'Entwurf erstellen'}
              </button>
              {draftError && <span className="text-xs text-red-600">{draftError}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuthRequired(AgentCreatorPage, {
  title: 'Neue*r Agent*in',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
