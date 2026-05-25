import { type UpdateUserAgentBody } from '@gruenerator/contracts';
import {
  DEFAULT_USER_AGENT_TOOLS,
  SKILLS,
  USER_SELECTABLE_TOOLS,
} from '@gruenerator/shared/agents';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { MultiStepForm } from '@gruenerator/ui';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useCreateUserAgent, useUpdateUserAgent, useUserAgent, type UserAgentInput } from './api';

import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';

type Locale = 'de-DE' | 'de-AT';

interface FormState {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  locale: Locale;
  openingMessage: string;
  openingQuestions: string;
  enabledTools: string[];
  skillMentions: string[];
  defaultNotebookId: string; // '' = none
  tags: string;
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo';
  maxTokens: number;
  temperature: number;
}

const EMPTY: FormState = {
  identifier: '',
  title: '',
  description: '',
  systemRole: '',
  avatar: '✨',
  backgroundColor: '#316049',
  locale: 'de-DE',
  openingMessage: '',
  openingQuestions: '',
  enabledTools: ['search', 'web'],
  skillMentions: [],
  defaultNotebookId: '',
  tags: '',
  model: 'mistral-large-latest',
  provider: 'mistral',
  maxTokens: 3000,
  temperature: 0.5,
};

const STEP_COUNT = 5;
const inputCls =
  'w-full rounded border border-grey-300 bg-background px-sm py-xs focus:border-primary-600 focus:outline-none dark:border-grey-700';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function AgentBuilderPage() {
  const navigate = useNavigate();
  const { identifier } = useParams<{ identifier?: string }>();
  const isEdit = !!identifier;
  const { data: existing } = useUserAgent(identifier);
  const createMut = useCreateUserAgent();
  const updateMut = useUpdateUserAgent(identifier ?? '');

  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Hydrate the form from the loaded agent once (edit mode). Setting state
  // during render — React's sanctioned "reset on prop change" pattern — avoids
  // a cascading-render effect.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useDocumentTitle(isEdit ? 'Agent*in bearbeiten' : 'Neue*r Agent*in');

  if (existing && hydratedFor !== existing.identifier) {
    setHydratedFor(existing.identifier);
    setForm({
      identifier: existing.identifier,
      title: existing.title,
      description: existing.description,
      systemRole: existing.systemRole,
      avatar: existing.avatar,
      backgroundColor: existing.backgroundColor,
      locale: existing.locale === 'de-AT' ? 'de-AT' : 'de-DE',
      openingMessage: existing.openingMessage,
      openingQuestions: existing.openingQuestions.join('\n'),
      // Fall back to defaults (not []) so editing a legacy agent that had no
      // enabledTools doesn't silently narrow it to zero tools.
      enabledTools: [...(existing.enabledTools ?? DEFAULT_USER_AGENT_TOOLS)],
      skillMentions: [...(existing.skillMentions ?? [])],
      defaultNotebookId: existing.defaultNotebookId ?? '',
      tags: existing.tags.join(', '),
      model: existing.model,
      provider: existing.provider,
      maxTokens: existing.params.max_tokens,
      temperature: existing.params.temperature,
    });
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const skillOptions = useMemo(
    () => SKILLS.map((s) => ({ mention: s.mention, title: s.title })),
    []
  );

  const { query: notebooksQuery } = useNotebookCollections({ isActive: true });
  const userNotebooks = notebooksQuery.data ?? [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const openingQuestions = form.openingQuestions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (isEdit) {
        const patch: UpdateUserAgentBody = {
          title: form.title.trim(),
          description: form.description.trim(),
          systemRole: form.systemRole.trim(),
          avatar: form.avatar.trim(),
          backgroundColor: form.backgroundColor,
          locale: form.locale,
          openingMessage: form.openingMessage,
          openingQuestions,
          enabledTools: form.enabledTools,
          skillMentions: form.skillMentions,
          defaultNotebookId: form.defaultNotebookId || null,
          tags,
          model: form.model,
          provider: form.provider,
          params: { max_tokens: form.maxTokens, temperature: form.temperature },
        };
        await updateMut.mutateAsync(patch);
        void navigate(`/agents/${identifier}/edit`);
      } else {
        const slug = slugifyName(form.title, 'agent');
        const payload: UserAgentInput = {
          // Suffix lowercased to satisfy the identifier regex `^[a-z0-9-]+$`
          // (generateSlugSuffix's alphabet includes uppercase letters).
          identifier: `${slug}-${generateSlugSuffix().toLowerCase()}`,
          title: form.title.trim(),
          description: form.description.trim(),
          systemRole: form.systemRole.trim(),
          avatar: form.avatar.trim(),
          backgroundColor: form.backgroundColor,
          tags,
          model: form.model,
          provider: form.provider,
          params: { max_tokens: form.maxTokens, temperature: form.temperature },
          openingMessage: form.openingMessage,
          openingQuestions,
          locale: form.locale,
          author: 'Eigene*r Agent*in',
          enabledTools: form.enabledTools,
          skillMentions: form.skillMentions,
          ...(form.defaultNotebookId ? { defaultNotebookId: form.defaultNotebookId } : {}),
        };
        const agent = await createMut.mutateAsync(payload);
        void navigate(`/agents/${agent.identifier}/edit`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const canProceed = step < STEP_COUNT - 1;
  const titleValid = form.title.trim().length > 0;
  const descValid = form.description.trim().length > 0;
  const avatarValid = form.avatar.trim().length > 0;
  const basicsValid = titleValid && descValid && avatarValid;
  const roleValid = form.systemRole.trim().length >= 10;

  return (
    <div className="mx-auto max-w-3xl p-md">
      <h1 className="mb-lg text-2xl font-semibold">
        {isEdit ? 'Agent*in bearbeiten' : 'Neue*r Agent*in'}
      </h1>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <MultiStepForm currentStep={step} onBack={() => setStep((s) => Math.max(0, s - 1))}>
          <MultiStepForm.Step title="Grundlagen" subtitle="Name, Beschreibung, Aussehen">
            <div className="flex flex-col gap-md">
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Titel</span>
                <input
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Beschreibung</span>
                <input
                  className={inputCls}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  maxLength={500}
                />
              </label>
              <div className="flex gap-md">
                <label className="flex flex-col gap-xs">
                  <span className="font-medium">Avatar (Emoji)</span>
                  <input
                    className={`${inputCls} w-24 text-center text-2xl`}
                    value={form.avatar}
                    onChange={(e) => set('avatar', e.target.value)}
                    maxLength={8}
                  />
                </label>
                <label className="flex flex-col gap-xs">
                  <span className="font-medium">Hintergrundfarbe</span>
                  <input
                    type="color"
                    className="h-10 w-24 cursor-pointer rounded border border-grey-300 dark:border-grey-700"
                    value={form.backgroundColor}
                    onChange={(e) => set('backgroundColor', e.target.value)}
                  />
                </label>
              </div>
            </div>
          </MultiStepForm.Step>

          <MultiStepForm.Step title="Persönlichkeit" subtitle="Anweisungen, Begrüßung, Region">
            <div className="flex flex-col gap-md">
              <label className="flex flex-col gap-xs">
                <span className="font-medium">System-Prompt</span>
                <textarea
                  className={`${inputCls} min-h-[200px] font-mono text-sm`}
                  value={form.systemRole}
                  onChange={(e) => set('systemRole', e.target.value)}
                  rows={10}
                  placeholder="Du bist ein*e ..."
                />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Begrüßungstext (optional)</span>
                <textarea
                  className={`${inputCls} min-h-[80px]`}
                  value={form.openingMessage}
                  onChange={(e) => set('openingMessage', e.target.value)}
                  rows={3}
                />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Region</span>
                <select
                  className={inputCls}
                  value={form.locale}
                  onChange={(e) => set('locale', e.target.value as Locale)}
                >
                  <option value="de-DE">Deutschland (de-DE)</option>
                  <option value="de-AT">Österreich (de-AT)</option>
                </select>
              </label>
            </div>
          </MultiStepForm.Step>

          <MultiStepForm.Step title="Fähigkeiten" subtitle="Tools und Skill-Schnellstarts">
            <div className="flex flex-col gap-lg">
              <fieldset className="flex flex-col gap-xs">
                <legend className="mb-xs font-medium">Werkzeuge</legend>
                <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
                  {USER_SELECTABLE_TOOLS.map((t) => (
                    <label
                      key={t.key}
                      className="flex cursor-pointer items-start gap-sm rounded border border-grey-200 p-sm dark:border-grey-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.enabledTools.includes(t.key)}
                        onChange={() => set('enabledTools', toggle(form.enabledTools, t.key))}
                      />
                      <span>
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span className="block text-xs text-foreground-muted">{t.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-xs">
                <legend className="mb-xs font-medium">Skill-Schnellstarts (optional)</legend>
                <div className="flex flex-wrap gap-xs">
                  {skillOptions.map((s) => {
                    const active = form.skillMentions.includes(s.mention);
                    return (
                      <button
                        type="button"
                        key={s.mention}
                        onClick={() => set('skillMentions', toggle(form.skillMentions, s.mention))}
                        className={`rounded-full border px-sm py-xs text-sm ${
                          active
                            ? 'border-primary-600 bg-primary-600/10 text-primary-700 dark:text-primary-300'
                            : 'border-grey-300 hover:bg-hover-alt dark:border-grey-700'
                        }`}
                      >
                        {s.title}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </MultiStepForm.Step>

          <MultiStepForm.Step title="Wissen" subtitle="Standard-Notizbuch (optional)">
            <label className="flex flex-col gap-xs">
              <span className="font-medium">Notizbuch</span>
              <select
                className={inputCls}
                value={form.defaultNotebookId}
                onChange={(e) => set('defaultNotebookId', e.target.value)}
              >
                <option value="">Kein Standard-Notizbuch</option>
                <optgroup label="Grünerator-Notizbücher">
                  {SYSTEM_NOTEBOOKS.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      {nb.title}
                    </option>
                  ))}
                </optgroup>
                {userNotebooks.length > 0 && (
                  <optgroup label="Meine Notizbücher">
                    {userNotebooks.map((nb) => (
                      <option key={String(nb.id)} value={String(nb.id)}>
                        {nb.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="text-xs text-foreground-muted">
                Wird beim Öffnen der Agent*in automatisch als Wissensquelle ausgewählt.
              </span>
            </label>
          </MultiStepForm.Step>

          <MultiStepForm.Step title="Überblick" subtitle="Startfragen, Erweitertes, Speichern">
            <div className="flex flex-col gap-md">
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Beispielfragen (eine pro Zeile, optional)</span>
                <textarea
                  className={`${inputCls} min-h-[80px]`}
                  value={form.openingQuestions}
                  onChange={(e) => set('openingQuestions', e.target.value)}
                  rows={4}
                />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-medium">Tags (kommagetrennt)</span>
                <input
                  className={inputCls}
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder="Klima, Verkehr"
                />
              </label>
              <details className="rounded border border-grey-200 p-md dark:border-grey-700">
                <summary className="cursor-pointer font-medium">Erweiterte Einstellungen</summary>
                <div className="mt-md flex flex-col gap-md">
                  <label className="flex flex-col gap-xs">
                    <span className="font-medium">Modell</span>
                    <input
                      className={inputCls}
                      value={form.model}
                      onChange={(e) => set('model', e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-xs">
                    <span className="font-medium">Provider</span>
                    <select
                      className={inputCls}
                      value={form.provider}
                      onChange={(e) => set('provider', e.target.value as FormState['provider'])}
                    >
                      <option value="mistral">Mistral</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="litellm">LiteLLM</option>
                      <option value="regolo">Regolo</option>
                    </select>
                  </label>
                  <div className="flex gap-md">
                    <label className="flex flex-1 flex-col gap-xs">
                      <span className="font-medium">Max. Tokens</span>
                      <input
                        type="number"
                        className={inputCls}
                        value={form.maxTokens}
                        min={100}
                        max={8000}
                        onChange={(e) => set('maxTokens', Number(e.target.value))}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-xs">
                      <span className="font-medium">Temperatur</span>
                      <input
                        type="number"
                        step="0.1"
                        className={inputCls}
                        value={form.temperature}
                        min={0}
                        max={1}
                        onChange={(e) => set('temperature', Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </details>
            </div>
          </MultiStepForm.Step>
        </MultiStepForm>

        {error && <p className="mt-md text-red-600">{error}</p>}

        <div className="mt-lg flex items-center justify-between gap-sm">
          <button
            type="button"
            className="rounded border border-grey-300 px-md py-sm hover:bg-hover-alt disabled:opacity-50 dark:border-grey-700"
            onClick={() => navigate('/skills')}
          >
            Abbrechen
          </button>
          {canProceed ? (
            <button
              type="button"
              className="rounded bg-primary-600 px-md py-sm text-white hover:bg-primary-700 disabled:opacity-50"
              disabled={(step === 0 && !basicsValid) || (step === 1 && !roleValid)}
              onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
            >
              Weiter
            </button>
          ) : (
            <button
              type="submit"
              className="rounded bg-primary-600 px-md py-sm text-white hover:bg-primary-700 disabled:opacity-50"
              disabled={!basicsValid || !roleValid || createMut.isPending || updateMut.isPending}
            >
              {isEdit ? 'Speichern' : 'Erstellen'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default AgentBuilderPage;
