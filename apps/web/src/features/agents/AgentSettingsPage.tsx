import { type UpdateUserAgentBody } from '@gruenerator/contracts';
import {
  getAgentSlug,
  SKILLS,
  USER_SELECTABLE_TOOLS,
  type Skill,
} from '@gruenerator/shared/agents';
import { Button, Card, Input, SectionHeader, Textarea } from '@gruenerator/ui';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { hydrateFormState, type FormState, type Locale } from './agentFormState';
import { useUpdateUserAgent, useUserAgent } from './api';
import { AgentAvatar } from './icons/AgentAvatar';
import { IconPicker } from './icons/IconPicker';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useAuthStore } from '@/stores/authStore';

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

type SectionKey =
  | 'grundlagen'
  | 'persoenlichkeit'
  | 'faehigkeiten'
  | 'wissen'
  | 'startfragen'
  | 'erweitert';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const TOOL_LABELS = new Map<string, string>(USER_SELECTABLE_TOOLS.map((t) => [t.key, t.label]));
const SKILL_TITLES = new Map<string, string>(SKILLS.map((s) => [s.mention, s.title]));

/**
 * Structured single-page agent editor: the agent is shown as a set of cards,
 * each editable inline (one section at a time) and saved on its own via a
 * partial PATCH. Replaces the step wizard for editing.
 */
function AgentSettingsPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useUserAgent(identifier);
  const updateMut = useUpdateUserAgent(identifier ?? '');
  const { query: notebooksQuery } = useNotebookCollections({ isActive: true });
  const userNotebooks = notebooksQuery.data ?? [];
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const visibleSkills = SKILLS.filter(
    (s: Skill) => s.audience === undefined || s.audience === 'all' || s.audience === userLocale
  );

  const [form, setForm] = useState<FormState | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(agent ? `${agent.title} bearbeiten` : 'Agent bearbeiten');

  // Hydrate once per loaded agent (React's sanctioned reset-on-prop-change).
  if (agent && hydratedFor !== agent.identifier) {
    setHydratedFor(agent.identifier);
    setForm(hydrateFormState(agent));
  }

  if (isLoading) {
    return (
      <PageContainer maxWidth="md">
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  }
  if (!agent || !form) {
    return (
      <PageContainer maxWidth="md">
        <p>Agent nicht gefunden.</p>
      </PageContainer>
    );
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  const cancel = () => {
    setForm(hydrateFormState(agent));
    setEditing(null);
    setError(null);
  };

  const save = async (patch: UpdateUserAgentBody) => {
    setError(null);
    try {
      const updated = await updateMut.mutateAsync(patch);
      setForm(hydrateFormState(updated));
      setHydratedFor(updated.identifier);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const openingQuestions = form.openingQuestions
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = form.tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const notebookLabel = (() => {
    if (!form.defaultNotebookId) return 'Keins';
    const sys = SYSTEM_NOTEBOOKS.find((n) => n.id === form.defaultNotebookId);
    if (sys) return sys.title;
    const own = userNotebooks.find((n) => String(n.id) === form.defaultNotebookId);
    return own?.name ?? form.defaultNotebookId;
  })();

  const section = (
    key: SectionKey,
    title: string,
    view: ReactNode,
    edit: ReactNode,
    onSave: () => void
  ) => {
    const isEditing = editing === key;
    return (
      <Card className="gap-0 py-md">
        <div className="px-md">
          <SectionHeader
            size="sm"
            title={title}
            actions={
              isEditing ? (
                <div className="flex items-center gap-xs">
                  <Button variant="ghost" size="sm" onClick={cancel} disabled={updateMut.isPending}>
                    Abbrechen
                  </Button>
                  <Button variant="brand" size="sm" onClick={onSave} disabled={updateMut.isPending}>
                    Speichern
                  </Button>
                </div>
              ) : (
                <Button
                  variant="brand-outline"
                  size="sm"
                  onClick={() => {
                    setEditing(key);
                    setError(null);
                  }}
                >
                  Bearbeiten
                </Button>
              )
            }
          />
          <div className="mt-sm">{isEditing ? edit : view}</div>
        </div>
      </Card>
    );
  };

  return (
    <PageContainer maxWidth="md">
      <div className="mx-auto flex max-w-3xl flex-col gap-md">
        <header className="flex items-start gap-md">
          <AgentAvatar
            iconKey={form.iconKey}
            avatar={form.avatar}
            backgroundColor={form.backgroundColor}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-foreground-heading">{agent.title}</h1>
            <p className="text-sm text-foreground-muted">{agent.description}</p>
          </div>
          <Button
            variant="brand"
            onClick={() => navigate(`/agents/${getAgentSlug(agent.identifier)}`)}
          >
            Im Chat öffnen
          </Button>
        </header>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Grundlagen */}
        {section(
          'grundlagen',
          'Grundlagen',
          <div className="flex flex-col gap-xs text-sm">
            <p className="text-foreground">{form.title}</p>
            <p className="text-foreground-muted">{form.description}</p>
          </div>,
          <div className="flex flex-col gap-md">
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
            <label className={labelCls}>
              Titel
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={100}
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
          </div>,
          () =>
            void save({
              title: form.title.trim(),
              description: form.description.trim(),
              iconKey: form.iconKey,
              avatar: form.avatar.trim() || '✨',
              backgroundColor: form.backgroundColor,
            })
        )}

        {/* Persönlichkeit */}
        {section(
          'persoenlichkeit',
          'Persönlichkeit',
          <div className="flex flex-col gap-xs text-sm">
            <p className="line-clamp-4 whitespace-pre-wrap text-foreground">{form.systemRole}</p>
            <p className="text-foreground-muted">
              Region: {form.locale === 'de-AT' ? 'Österreich' : 'Deutschland'}
            </p>
          </div>,
          <div className="flex flex-col gap-md">
            <label className={labelCls}>
              System-Prompt
              <Textarea
                className="min-h-[200px] font-mono"
                value={form.systemRole}
                onChange={(e) => set('systemRole', e.target.value)}
                rows={10}
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
          </div>,
          () =>
            void save({
              systemRole: form.systemRole.trim(),
              openingMessage: form.openingMessage,
              locale: form.locale,
            })
        )}

        {/* Fähigkeiten */}
        {section(
          'faehigkeiten',
          'Fähigkeiten',
          <div className="flex flex-col gap-sm text-sm">
            <div className="flex flex-wrap gap-xs">
              {form.enabledTools.length > 0 ? (
                form.enabledTools.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-grey-100 px-sm py-0.5 text-xs dark:bg-grey-800"
                  >
                    {TOOL_LABELS.get(t) ?? t}
                  </span>
                ))
              ) : (
                <span className="text-foreground-muted">Keine Werkzeuge</span>
              )}
            </div>
            {form.skillMentions.length > 0 && (
              <p className="text-xs text-foreground-muted">
                Skills: {form.skillMentions.map((m) => SKILL_TITLES.get(m) ?? m).join(', ')}
              </p>
            )}
          </div>,
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
            <fieldset className="flex flex-col gap-xs">
              <legend className="mb-xs text-sm font-medium">Skill-Schnellstarts (optional)</legend>
              <div className="flex flex-wrap gap-xs">
                {visibleSkills.map((s) => {
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
            </fieldset>
          </div>,
          () => void save({ enabledTools: form.enabledTools, skillMentions: form.skillMentions })
        )}

        {/* Wissen */}
        {section(
          'wissen',
          'Wissen',
          <p className="text-sm text-foreground">Standard-Notebook: {notebookLabel}</p>,
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
          </label>,
          () => void save({ defaultNotebookId: form.defaultNotebookId || null })
        )}

        {/* Startfragen & Tags */}
        {section(
          'startfragen',
          'Startfragen & Tags',
          <div className="flex flex-col gap-sm text-sm">
            {openingQuestions.length > 0 ? (
              <ul className="list-disc pl-5 text-foreground">
                {openingQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">Keine Startfragen</p>
            )}
            {tags.length > 0 && (
              <p className="text-xs text-foreground-muted">Tags: {tags.join(', ')}</p>
            )}
          </div>,
          <div className="flex flex-col gap-md">
            <label className={labelCls}>
              Beispielfragen (eine pro Zeile)
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
          </div>,
          () => void save({ openingQuestions, tags })
        )}

        {/* Erweitert */}
        {section(
          'erweitert',
          'Erweitert',
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-muted">
            <span>
              Modell: <span className="text-foreground">{form.model}</span>
            </span>
            <span>
              Provider: <span className="text-foreground">{form.provider}</span>
            </span>
            <span>
              Tokens: <span className="text-foreground">{form.maxTokens}</span>
            </span>
            <span>
              Temperatur: <span className="text-foreground">{form.temperature}</span>
            </span>
          </div>,
          <div className="flex flex-col gap-md">
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
          </div>,
          () =>
            void save({
              model: form.model,
              provider: form.provider,
              params: { max_tokens: form.maxTokens, temperature: form.temperature },
            })
        )}
      </div>
    </PageContainer>
  );
}

export default AgentSettingsPage;
