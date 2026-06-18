import { getAgentSlug, USER_SELECTABLE_TOOLS } from '@gruenerator/shared/agents';
import { isModelEnabledByDefault, TEXT_MODELS } from '@gruenerator/shared/models';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { Button, Input, Textarea } from '@gruenerator/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { formToPayload, type FormState, type Locale } from './agentFormState';
import { AgentPreview } from './AgentPreview';
import { useCreateUserAgent, useUpdateUserAgent } from './api';
import { ExperimentalAgentBanner } from './experimentalWarning';
import { AgentAvatar } from './icons/AgentAvatar';
import { IconPicker } from './icons/IconPicker';

import PageContainer from '@/components/common/PageContainer';
import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';

// The same model set the chat composer offers, single-sourced from the catalog.
const MODEL_OPTIONS = TEXT_MODELS.filter((m) => isModelEnabledByDefault(m.id));

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

  // Match the stored {model, provider} pair back to a catalog option id.
  const currentModelId =
    MODEL_OPTIONS.find((m) => m.model === form.model && m.provider === form.provider)?.id ?? '';

  const notebookCheckbox = (id: string, label: string) => (
    <label
      key={id}
      className="flex cursor-pointer items-center gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700"
    >
      <input
        type="checkbox"
        className="shrink-0"
        checked={form.defaultNotebookIds.includes(id)}
        onChange={() => set('defaultNotebookIds', toggle(form.defaultNotebookIds, id))}
      />
      <span className="min-w-0 truncate text-sm">{label}</span>
    </label>
  );

  const notebookSelect = (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-sm font-medium">Wissen</legend>
      <span className="text-xs font-normal text-foreground-muted">
        Notebooks, die der Agent automatisch als Wissensquelle durchsucht. Mehrfachauswahl möglich –
        alle ausgewählten Notebooks werden gemeinsam durchsucht.
      </span>
      <div className="flex flex-col gap-xs">
        <span className="text-xs font-medium text-foreground-muted">Grünerator-Notebooks</span>
        <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
          {SYSTEM_NOTEBOOKS.map((nb) => notebookCheckbox(nb.id, nb.title))}
        </div>
      </div>
      {userNotebooks.length > 0 && (
        <div className="flex flex-col gap-xs">
          <span className="text-xs font-medium text-foreground-muted">Meine Notebooks</span>
          <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
            {userNotebooks.map((nb) => notebookCheckbox(String(nb.id), nb.name))}
          </div>
        </div>
      )}
    </fieldset>
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

      <ExperimentalAgentBanner className="mb-md" />

      {error && <p className="mb-md text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-lg">
          {/* Tier 1 — always visible core */}
          <div className="flex flex-col gap-md">
            <div className="flex items-end gap-sm">
              <label className={`${labelCls} flex-1`}>
                Name
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={100}
                  placeholder="Gib deinem Agenten einen Namen"
                />
              </label>
              <IconPicker
                compact
                value={form.iconKey}
                onChange={(v) => set('iconKey', v)}
                backgroundColor={form.backgroundColor}
              />
            </div>
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

          <label className="flex cursor-pointer items-start gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.inlineSourceLinks}
              onChange={(e) => set('inlineSourceLinks', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Quell-Links direkt im Antworttext</span>
              <span className="block text-xs text-foreground-muted">
                Für versandfertige E-Mails/Briefe: konkrete Artikel-URLs aus der Recherche
                erscheinen inline im Text statt nur als Quellen-Karten.
              </span>
            </span>
          </label>

          {notebookSelect}

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
              <label className="flex cursor-pointer items-start gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.inlineSourceLinks}
                  onChange={(e) => set('inlineSourceLinks', e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Quell-Links direkt im Antworttext
                  </span>
                  <span className="block text-xs text-foreground-muted">
                    Für versandfertige E-Mails/Briefe: konkrete Artikel-URLs aus der Recherche
                    erscheinen inline im Text statt nur als Quellen-Karten.
                  </span>
                </span>
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
                <select
                  className={selectCls}
                  value={currentModelId}
                  onChange={(e) => {
                    const opt = MODEL_OPTIONS.find((m) => m.id === e.target.value);
                    if (!opt) return;
                    setJustSaved(false);
                    setForm((prev) => ({ ...prev, model: opt.model, provider: opt.provider }));
                  }}
                >
                  {!currentModelId && (
                    <option value="" disabled>
                      Modell wählen
                    </option>
                  )}
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} – {m.description}
                    </option>
                  ))}
                </select>
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
