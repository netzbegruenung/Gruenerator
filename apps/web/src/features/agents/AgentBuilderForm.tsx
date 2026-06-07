import { SKILLS, USER_SELECTABLE_TOOLS, type Skill } from '@gruenerator/shared/agents';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { Button, Input, MultiStepForm, Textarea } from '@gruenerator/ui';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { EMPTY_FORM, type FormState, type Locale } from './agentFormState';
import { useCreateUserAgent, type UserAgentInput } from './api';
import { IconPicker } from './icons/IconPicker';

import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useAuthStore } from '@/stores/authStore';

const STEP_COUNT = 5;
// Native select styled to match the design-system `Input`.
const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface AgentBuilderFormProps {
  /** Pre-fill — e.g. a synthesized draft from the AI start screen. */
  initialState?: Partial<FormState>;
  onCancel?: () => void;
}

/**
 * The 5-step create wizard. Used for the manual route and the AI-assisted
 * create (pre-filled via `initialState`). Editing an existing agent uses the
 * structured {@link AgentSettingsPage} instead.
 */
function AgentBuilderForm({ initialState, onCancel }: AgentBuilderFormProps) {
  const navigate = useNavigate();
  const createMut = useCreateUserAgent();

  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY_FORM, ...initialState }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const skillOptions = useMemo(
    () =>
      SKILLS.filter(
        (s: Skill) => s.audience === undefined || s.audience === 'all' || s.audience === userLocale
      ).map((s) => ({ mention: s.mention, title: s.title })),
    [userLocale]
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
      const slug = slugifyName(form.title, 'agent');
      const payload: UserAgentInput = {
        // Suffix lowercased to satisfy the identifier regex `^[a-z0-9-]+$`
        // (generateSlugSuffix's alphabet includes uppercase letters).
        identifier: `${slug}-${generateSlugSuffix().toLowerCase()}`,
        title: form.title.trim(),
        description: form.description.trim(),
        systemRole: form.systemRole.trim(),
        avatar: form.avatar.trim() || '✨',
        iconKey: form.iconKey,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const canProceed = step < STEP_COUNT - 1;
  const titleValid = form.title.trim().length > 0;
  const descValid = form.description.trim().length > 0;
  const basicsValid = titleValid && descValid;
  const roleValid = form.systemRole.trim().length >= 10;

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      <MultiStepForm currentStep={step} onBack={() => setStep((s) => Math.max(0, s - 1))}>
        <MultiStepForm.Step title="Grundlagen" subtitle="Name, Beschreibung, Aussehen">
          <div className="flex flex-col gap-md">
            <label className={labelCls}>
              Titel
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={100}
                required
              />
            </label>
            <label className={labelCls}>
              Beschreibung
              <Input
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={500}
              />
            </label>
            <div className="flex flex-wrap items-end gap-md">
              <div className="flex flex-col gap-xs text-sm font-medium">
                Icon
                <IconPicker
                  value={form.iconKey}
                  onChange={(v) => set('iconKey', v)}
                  backgroundColor={form.backgroundColor}
                />
              </div>
              <label className={labelCls}>
                Hintergrundfarbe
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
            <label className={labelCls}>
              System-Prompt
              <Textarea
                className="min-h-[200px] font-mono"
                value={form.systemRole}
                onChange={(e) => set('systemRole', e.target.value)}
                rows={10}
                placeholder="Du bist ein*e ..."
              />
            </label>
            <label className={labelCls}>
              Begrüßungstext (optional)
              <Textarea
                className="min-h-[80px]"
                value={form.openingMessage}
                onChange={(e) => set('openingMessage', e.target.value)}
                rows={3}
              />
            </label>
            <label className={labelCls}>
              Region
              <select
                className={selectCls}
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
              <legend className="mb-xs text-sm font-medium">Werkzeuge</legend>
              <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
                {USER_SELECTABLE_TOOLS.map((t) => (
                  <label
                    key={t.key}
                    className="flex cursor-pointer items-start gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700"
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

            <details className="rounded-md border border-grey-200 p-md dark:border-grey-700">
              <summary className="cursor-pointer text-sm font-medium">
                Skill-Schnellstarts (optional)
              </summary>
              <div className="mt-md flex flex-wrap gap-xs">
                {skillOptions.map((s) => {
                  const active = form.skillMentions.includes(s.mention);
                  return (
                    <Button
                      type="button"
                      key={s.mention}
                      variant={active ? 'brand' : 'brand-outline'}
                      size="sm"
                      onClick={() => set('skillMentions', toggle(form.skillMentions, s.mention))}
                    >
                      {s.title}
                    </Button>
                  );
                })}
              </div>
            </details>
          </div>
        </MultiStepForm.Step>

        <MultiStepForm.Step title="Wissen" subtitle="Standard-Notebook (optional)">
          <label className={labelCls}>
            Notebook
            <select
              className={selectCls}
              value={form.defaultNotebookId}
              onChange={(e) => set('defaultNotebookId', e.target.value)}
            >
              <option value="">Kein Standard-Notebook</option>
              <optgroup label="Grünerator-Notebooks">
                {SYSTEM_NOTEBOOKS.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    {nb.title}
                  </option>
                ))}
              </optgroup>
              {userNotebooks.length > 0 && (
                <optgroup label="Meine Notebooks">
                  {userNotebooks.map((nb) => (
                    <option key={String(nb.id)} value={String(nb.id)}>
                      {nb.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="text-xs font-normal text-foreground-muted">
              Wird beim Öffnen des Agenten automatisch als Wissensquelle ausgewählt.
            </span>
          </label>
        </MultiStepForm.Step>

        <MultiStepForm.Step title="Überblick" subtitle="Startfragen, Erweitertes, Speichern">
          <div className="flex flex-col gap-md">
            <label className={labelCls}>
              Beispielfragen (eine pro Zeile, optional)
              <Textarea
                className="min-h-[80px]"
                value={form.openingQuestions}
                onChange={(e) => set('openingQuestions', e.target.value)}
                rows={4}
              />
            </label>
            <label className={labelCls}>
              Tags (kommagetrennt)
              <Input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="Klima, Verkehr"
              />
            </label>
            <details className="rounded-md border border-grey-200 p-md dark:border-grey-700">
              <summary className="cursor-pointer text-sm font-medium">
                Erweiterte Einstellungen
              </summary>
              <div className="mt-md flex flex-col gap-md">
                <label className={labelCls}>
                  Modell
                  <Input value={form.model} onChange={(e) => set('model', e.target.value)} />
                </label>
                <label className={labelCls}>
                  Provider
                  <select
                    className={selectCls}
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
                  <label className={`${labelCls} flex-1`}>
                    Max. Tokens
                    <Input
                      type="number"
                      value={form.maxTokens}
                      min={100}
                      max={8000}
                      onChange={(e) => set('maxTokens', Number(e.target.value))}
                    />
                  </label>
                  <label className={`${labelCls} flex-1`}>
                    Temperatur
                    <Input
                      type="number"
                      step="0.1"
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

      {error && <p className="mt-md text-sm text-destructive">{error}</p>}

      <div className="mt-lg flex items-center justify-between gap-sm">
        <Button
          type="button"
          variant="brand-outline"
          onClick={() => (onCancel ? onCancel() : navigate('/agents'))}
        >
          Abbrechen
        </Button>
        {canProceed ? (
          <Button
            type="button"
            variant="brand"
            disabled={(step === 0 && !basicsValid) || (step === 1 && !roleValid)}
            onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
          >
            Weiter
          </Button>
        ) : (
          <Button
            type="submit"
            variant="brand"
            disabled={!basicsValid || !roleValid || createMut.isPending}
          >
            Erstellen
          </Button>
        )}
      </div>
    </form>
  );
}

export default AgentBuilderForm;
