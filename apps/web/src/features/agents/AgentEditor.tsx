import { getAgentSlug, USER_SELECTABLE_TOOLS } from '@gruenerator/shared/agents';
import { isModelEnabledByDefault, TEXT_MODELS } from '@gruenerator/shared/models';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { Button, Input, Textarea } from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateRecurringTask, useUpdateRecurringTask } from '../recurring-tasks/api';
import { RecurrenceFields } from '../recurring-tasks/RecurrenceFields';
import {
  DEFAULT_SCHEDULE,
  scheduleToRecurrence,
  type ScheduleState,
} from '../recurring-tasks/scheduleState';

import { formToPayload, type FormState, type Locale } from './agentFormState';
import { AgentPreview } from './AgentPreview';
import { useCreateUserAgent, useUpdateUserAgent } from './api';
import { ExperimentalAgentBanner } from './experimentalWarning';
import { AgentAvatar } from './icons/AgentAvatar';
import { IconPicker } from './icons/IconPicker';
import { OptionToggle } from './OptionToggle';

import PageContainer from '@/components/common/PageContainer';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { useNotebookCollections } from '@/features/auth/hooks/useProfileData';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';

// The same model set the chat composer offers, single-sourced from the catalog.
const MODEL_OPTIONS = TEXT_MODELS.filter((m) => isModelEnabledByDefault(m.id));

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

type Section = 'grund' | 'tools' | 'wissen' | 'zeitplan';

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
  /**
   * `recurring` (create) surfaces the Zeitplan tab and, on save, also creates a
   * recurring task bound to the new agent. `agent` (default) is the plain builder.
   */
  variant?: 'agent' | 'recurring';
  /** Edit only — the loaded task's schedule, when this agent already has one. */
  initialSchedule?: ScheduleState | null;
  /** Edit only — id of the recurring task to PATCH alongside the agent. */
  recurringTaskId?: string;
}

/**
 * Single-page agent editor: a sticky action header, the form split into
 * Grundlagen / Werkzeuge / Wissen tabs, and a live preview pane alongside. Shared
 * by the create routes and the edit route, so create and edit behave identically.
 */
function AgentEditor({
  mode,
  initialState,
  identifier,
  onCancel,
  variant = 'agent',
  initialSchedule = null,
  recurringTaskId,
}: AgentEditorProps) {
  const navigate = useNavigate();
  const createMut = useCreateUserAgent();
  const updateMut = useUpdateUserAgent(identifier ?? '');
  const createTaskMut = useCreateRecurringTask();
  const updateTaskMut = useUpdateRecurringTask();
  const saving =
    createMut.isPending ||
    updateMut.isPending ||
    createTaskMut.isPending ||
    updateTaskMut.isPending;

  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [section, setSection] = useState<Section>('grund');

  // The Zeitplan tab shows for recurring create and when editing an agent that
  // already has a recurring task. Its state is kept outside FormState — it maps to
  // the recurring-task call, not the user-agent payload.
  const showSchedule = variant === 'recurring' || initialSchedule != null;
  const [schedule, setSchedule] = useState<ScheduleState>(initialSchedule ?? DEFAULT_SCHEDULE);
  // Holds the agent id after a successful create so a failed follow-up task call
  // can be retried without creating a duplicate agent.
  const createdIdentifierRef = useRef<string | null>(null);

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
        // Create the agent once; keep its id so a failed follow-up task call can
        // retry without spawning a duplicate agent.
        let agentId = createdIdentifierRef.current;
        if (!agentId) {
          const slug = slugifyName(form.title, 'agent');
          // Suffix lowercased to satisfy the identifier regex `^[a-z0-9-]+$`.
          const created = await createMut.mutateAsync({
            identifier: `${slug}-${generateSlugSuffix().toLowerCase()}`,
            author: 'Eigene*r Agent*in',
            ...payload,
          });
          agentId = created.identifier;
          createdIdentifierRef.current = agentId;
        }
        if (variant === 'recurring') {
          try {
            await createTaskMut.mutateAsync({
              title: form.title.trim(),
              instruction: form.systemRole.trim(),
              agentIdentifier: agentId,
              recurrence: scheduleToRecurrence(schedule),
              delivery: schedule.delivery,
              timezone: schedule.timezone,
              locale: form.locale,
              enabled: true,
            });
          } catch {
            setError(
              'Agent angelegt, aber der Zeitplan konnte nicht gespeichert werden. Bitte erneut speichern.'
            );
            return;
          }
          void navigate('/agentura?cat=wiederkehrend');
        } else {
          void navigate(`/agents/${agentId}/edit`);
        }
      } else {
        await updateMut.mutateAsync(payload);
        if (recurringTaskId) {
          await updateTaskMut.mutateAsync({
            id: recurringTaskId,
            patch: {
              title: form.title.trim(),
              instruction: form.systemRole.trim(),
              recurrence: scheduleToRecurrence(schedule),
              delivery: schedule.delivery,
              timezone: schedule.timezone,
            },
          });
        }
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

  const toolCount = form.enabledTools.length + (form.inlineSourceLinks ? 1 : 0);
  const notebookCount = form.defaultNotebookIds.length;
  const sectionTabs = [
    { key: 'grund' as const, label: 'Grundlagen' },
    { key: 'tools' as const, label: `Werkzeuge${toolCount ? ` · ${toolCount}` : ''}` },
    { key: 'wissen' as const, label: `Wissen${notebookCount ? ` · ${notebookCount}` : ''}` },
    ...(showSchedule ? [{ key: 'zeitplan' as const, label: 'Zeitplan' }] : []),
  ];

  return (
    <PageContainer maxWidth="lg" noPadTop>
      {/* Sticky action bar — bleeds to the container padding edges. */}
      <header className="sticky top-0 z-20 -mx-lg mb-lg flex flex-wrap items-center gap-md border-b border-grey-200 bg-background/90 px-lg py-md backdrop-blur-sm dark:border-grey-700 max-md:-mx-md max-md:px-md">
        <div className="flex min-w-0 flex-1 items-center gap-md">
          <AgentAvatar
            iconKey={form.iconKey}
            avatar={form.avatar}
            backgroundColor={form.backgroundColor}
            size="md"
          />
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground-heading">
            {mode === 'create' ? 'Neuer Agent' : form.title || 'Agent bearbeiten'}
          </h1>
        </div>
        <div className="flex items-center gap-sm">
          {justSaved && <span className="text-sm text-foreground-muted">Gespeichert ✓</span>}
          {mode === 'edit' && identifier && (
            <Button
              variant="brand-outline"
              size="sm"
              onClick={() => navigate(`/agents/${getAgentSlug(identifier)}`)}
            >
              Im Chat öffnen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (onCancel ? onCancel() : navigate('/agents'))}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            Speichern
          </Button>
        </div>
      </header>

      <ExperimentalAgentBanner className="mb-lg" />

      {error && <p className="mb-md text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-2xl">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <UnderlineTabs
            tabs={sectionTabs}
            value={section}
            onChange={setSection}
            className="mb-lg"
          />

          {section === 'grund' && (
            <div className="flex flex-col gap-lg">
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

              {/* Conversation */}
              <details className="rounded-lg border border-grey-200 p-md dark:border-grey-700">
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

              {/* Advanced */}
              <details className="rounded-lg border border-grey-200 p-md dark:border-grey-700">
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
          )}

          {section === 'tools' && (
            <div>
              <div className="mb-md">
                <h2 className="m-0 text-base font-bold text-foreground-heading">Werkzeuge</h2>
                <p className="m-0 mt-1 text-sm text-foreground-muted">
                  Wähle, was der Agent im Gespräch nutzen darf.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                {USER_SELECTABLE_TOOLS.map((t) => (
                  <OptionToggle
                    key={t.key}
                    checked={form.enabledTools.includes(t.key)}
                    onToggle={() => set('enabledTools', toggle(form.enabledTools, t.key))}
                    title={t.label}
                    description={t.description}
                  />
                ))}
              </div>
              <div className="mt-sm">
                <OptionToggle
                  checked={form.inlineSourceLinks}
                  onToggle={() => set('inlineSourceLinks', !form.inlineSourceLinks)}
                  title="Quell-Links direkt im Antworttext"
                  description="Für versandfertige E-Mails/Briefe: konkrete Artikel-URLs aus der Recherche erscheinen inline im Text statt nur als Quellen-Karten."
                />
              </div>
            </div>
          )}

          {section === 'wissen' && (
            <div>
              <div className="mb-md">
                <h2 className="m-0 text-base font-bold text-foreground-heading">Wissen</h2>
                <p className="m-0 mt-1 text-sm text-foreground-muted">
                  Notebooks, die der Agent automatisch als Wissensquelle durchsucht. Mehrfachauswahl
                  möglich.
                </p>
              </div>
              <div className="mb-xs text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Grünerator-Notebooks
              </div>
              <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                {SYSTEM_NOTEBOOKS.map((nb) => (
                  <OptionToggle
                    key={nb.id}
                    checked={form.defaultNotebookIds.includes(nb.id)}
                    onToggle={() =>
                      set('defaultNotebookIds', toggle(form.defaultNotebookIds, nb.id))
                    }
                    title={nb.title}
                  />
                ))}
              </div>
              {userNotebooks.length > 0 && (
                <>
                  <div className="mb-xs mt-md text-xs font-medium uppercase tracking-wide text-foreground-muted">
                    Meine Notebooks
                  </div>
                  <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                    {userNotebooks.map((nb) => (
                      <OptionToggle
                        key={String(nb.id)}
                        checked={form.defaultNotebookIds.includes(String(nb.id))}
                        onToggle={() =>
                          set('defaultNotebookIds', toggle(form.defaultNotebookIds, String(nb.id)))
                        }
                        title={nb.name}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {section === 'zeitplan' && (
            <div>
              <div className="mb-md">
                <h2 className="m-0 text-base font-bold text-foreground-heading">Zeitplan</h2>
                <p className="m-0 mt-1 text-sm text-foreground-muted">
                  Wann und wie oft der Agent automatisch läuft. Ausgeführt wird dabei die Anleitung
                  des Agenten; das Ergebnis wird wie gewählt geliefert.
                </p>
              </div>
              <RecurrenceFields value={schedule} onChange={setSchedule} />
            </div>
          )}
        </div>

        {/* ── Preview pane ────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[88px] lg:h-fit">
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
