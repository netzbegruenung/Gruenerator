import {
  getAgentSlug,
  SKILLS,
  USER_SELECTABLE_TOOLS,
  type Skill,
} from '@gruenerator/shared/agents';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { Button, Input, Textarea } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { formToPayload, type FormState, type Locale } from './agentFormState';
import { AgentPreview } from './AgentPreview';
import { useCreateUserAgent, useUpdateUserAgent } from './api';
import { AgentAvatar } from './icons/AgentAvatar';
import { IconPicker } from './icons/IconPicker';

import PageContainer from '@/components/common/PageContainer';
import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useAuthStore } from '@/stores/authStore';

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface AgentEditorProps {
  mode: 'create' | 'edit';
  /** EMPTY_FORM (+AI draft) for create, hydrateFormState(agent) for edit. */
  initialState: FormState;
  /** Edit only — drives the PATCH target and the "Im Chat öffnen" link. */
  identifier?: string;
  onCancel?: () => void;
}

/**
 * Single-page agent editor (Gemini "Gem" style): one scrollable form column with
 * a Gemini-minimal progressive-disclosure layout (core fields visible, the rest
 * in two collapsibles) next to a live preview pane, saved with one button.
 * Shared by the create routes and the edit route.
 */
function AgentEditor({ mode, initialState, identifier, onCancel }: AgentEditorProps) {
  const navigate = useNavigate();
  const createMut = useCreateUserAgent();
  const updateMut = useUpdateUserAgent(identifier ?? '');
  const saving = createMut.isPending || updateMut.isPending;

  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setJustSaved(false);
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const skillOptions = useMemo(
    () =>
      SKILLS.filter(
        (s: Skill) => s.audience === undefined || s.audience === 'all' || s.audience === userLocale
      ),
    [userLocale]
  );

  const { query: notebooksQuery } = useNotebookCollections({ isActive: true });
  const userNotebooks = notebooksQuery.data ?? [];

  const titleValid = form.title.trim().length > 0;
  const descValid = form.description.trim().length > 0;
  const roleValid = form.systemRole.trim().length >= 10;
  const canSave = titleValid && descValid && roleValid && !saving;

  const handleSave = async () => {
    setError(null);
    try {
      const payload = formToPayload(form);
      if (mode === 'create') {
        const slug = slugifyName(form.title, 'agent');
        // Suffix lowercased to satisfy the identifier regex `^[a-z0-9-]+$`.
        const created = await createMut.mutateAsync({
          identifier: `${slug}-${generateSlugSuffix().toLowerCase()}`,
          author: 'Eigene*r Agent*in',
          ...payload,
        });
        void navigate(`/agents/${created.identifier}/edit`);
      } else {
        await updateMut.mutateAsync(payload);
        setJustSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const openingQuestions = form.openingQuestions
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const notebookSelect = (
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
  );

  return (
    <PageContainer maxWidth="lg" noPadTop>
      {/* Top bar — heading on the left, single Save on the right. */}
      <header className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <div className="flex min-w-0 items-center gap-md">
          {mode === 'edit' && (
            <AgentAvatar
              iconKey={form.iconKey}
              avatar={form.avatar}
              backgroundColor={form.backgroundColor}
              size="md"
            />
          )}
          <h1 className="truncate text-2xl font-semibold text-foreground-heading">
            {mode === 'create' ? 'Neuer Agent' : form.title || 'Agent bearbeiten'}
          </h1>
        </div>
        <div className="flex items-center gap-sm">
          {justSaved && <span className="text-sm text-foreground-muted">Gespeichert ✓</span>}
          {mode === 'edit' && identifier && (
            <Button
              variant="brand-outline"
              onClick={() => navigate(`/agents/${getAgentSlug(identifier)}`)}
            >
              Im Chat öffnen
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => (onCancel ? onCancel() : navigate('/agents'))}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button variant="brand" onClick={() => void handleSave()} disabled={!canSave}>
            Speichern
          </Button>
        </div>
      </header>

      {error && <p className="mb-md text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-lg">
          {/* Tier 1 — always visible core */}
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
              Name
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={100}
                placeholder="Gib deinem Agenten einen Namen"
              />
            </label>
            <label className={labelCls}>
              Beschreibung
              <Input
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={500}
                placeholder="Beschreibe deinen Agenten und wie er funktioniert"
              />
            </label>
            <label className={labelCls}>
              Anleitung
              <Textarea
                className="min-h-[220px] font-mono"
                value={form.systemRole}
                onChange={(e) => set('systemRole', e.target.value)}
                rows={11}
                placeholder="Du bist ein*e …"
              />
            </label>
          </div>

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

          <label className={labelCls}>
            Wissen
            <span className="text-xs font-normal text-foreground-muted">
              Standard-Notebook, das beim Öffnen automatisch als Wissensquelle ausgewählt wird.
            </span>
            {notebookSelect}
          </label>

          {/* Tier 2 — conversation */}
          <details className="rounded-md border border-grey-200 p-md dark:border-grey-700">
            <summary className="cursor-pointer text-sm font-medium">
              Begrüßung & Startfragen
            </summary>
            <div className="mt-md flex flex-col gap-md">
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
                Beispielfragen (eine pro Zeile, optional)
                <Textarea
                  className="min-h-[80px]"
                  value={form.openingQuestions}
                  onChange={(e) => set('openingQuestions', e.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </details>

          {/* Tier 3 — advanced */}
          <details className="rounded-md border border-grey-200 p-md dark:border-grey-700">
            <summary className="cursor-pointer text-sm font-medium">
              Erweiterte Einstellungen
            </summary>
            <div className="mt-md flex flex-col gap-md">
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

              <fieldset className="flex flex-col gap-xs">
                <legend className="mb-xs text-sm font-medium">
                  Skill-Schnellstarts (optional)
                </legend>
                <div className="flex flex-wrap gap-xs">
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
              </fieldset>

              <label className={labelCls}>
                Tags (kommagetrennt)
                <Input
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder="Klima, Verkehr"
                />
              </label>

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
              <label className={labelCls}>
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
          </details>
        </div>

        {/* ── Preview pane ────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[80px] lg:h-fit">
          <AgentPreview
            iconKey={form.iconKey}
            avatar={form.avatar}
            backgroundColor={form.backgroundColor}
            title={form.title}
            description={form.description}
            openingMessage={form.openingMessage}
            openingQuestions={openingQuestions}
          />
        </div>
      </div>
    </PageContainer>
  );
}

export default AgentEditor;
