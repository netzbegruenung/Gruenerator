import { MAX_RECURRING_TASK_INSTRUCTION } from '@gruenerator/contracts';
import { getAgentSlug, USER_SELECTABLE_TOOLS, type Agent } from '@gruenerator/shared/agents';
import {
  DEFAULT_SCHEDULE,
  scheduleToRecurrence,
  type ScheduleState,
  formToPayload,
  type FormState,
  type Locale,
} from '@gruenerator/shared/grueneratoren';
import { isModelEnabledByDefault, TEXT_MODELS } from '@gruenerator/shared/models';
import { Button, Input, Textarea } from '@gruenerator/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RecipePicker } from '../agentura/recipes/RecipePicker';
import { useUpdateRecurringTask } from '../recurring-tasks/api';
import { RecurrenceFields } from '../recurring-tasks/RecurrenceFields';

import { AgentConversionNotice } from './AgentDeprecationNotice';
import { AgentPreview } from './AgentPreview';
import { useUpdateUserAgent } from './api';
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
  /** hydrateFormState(agent). */
  initialState: FormState;
  /** Drives the PATCH target and the "Im Chat öffnen" link. */
  identifier?: string;
  onCancel?: () => void;
  /** The loaded task's schedule, when this agent already has one. */
  initialSchedule?: ScheduleState | null;
  /** Id of the recurring task to PATCH alongside the agent. */
  recurringTaskId?: string;
  /** The stored agent, for the conversion notice. */
  agent?: Agent;
}

/**
 * Single-page agent editor: a sticky action header, the form split into
 * Grundlagen / Werkzeuge / Wissen tabs, and a live preview pane alongside. Edit
 * only: new agents are closed, new tasks are built in `RecurringTaskBuilderPage`.
 */
function AgentEditor({
  initialState,
  identifier,
  onCancel,
  initialSchedule = null,
  recurringTaskId,
  agent,
}: AgentEditorProps) {
  const navigate = useNavigate();
  const updateMut = useUpdateUserAgent(identifier ?? '');
  const updateTaskMut = useUpdateRecurringTask();
  const saving = updateMut.isPending || updateTaskMut.isPending;

  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [section, setSection] = useState<Section>('grund');

  // The Zeitplan tab shows when the agent already has a recurring task. Its state is kept outside FormState — it maps to
  // the recurring-task call, not the user-agent payload.
  const showSchedule = initialSchedule != null;
  const [schedule, setSchedule] = useState<ScheduleState>(initialSchedule ?? DEFAULT_SCHEDULE);

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
      // Block early when this save also writes a recurring task whose instruction
      // (= the Anleitung) would exceed the contract cap.
      if (
        recurringTaskId != null &&
        form.systemRole.trim().length > MAX_RECURRING_TASK_INSTRUCTION
      ) {
        setError(
          `Die Anleitung ist zu lang für eine wiederkehrende Aufgabe (max. ${MAX_RECURRING_TASK_INSTRUCTION} Zeichen). Bitte kürze sie.`
        );
        setSection('grund');
        return;
      }

      const payload = formToPayload(form);
      await updateMut.mutateAsync(payload);
      if (recurringTaskId) {
        await updateTaskMut.mutateAsync({
          id: recurringTaskId,
          patch: {
            title: form.title.trim(),
            instruction: form.systemRole.trim(),
            recurrence: scheduleToRecurrence(schedule),
            delivery: schedule.delivery,
            emailNotify: schedule.emailNotify,
            timezone: schedule.timezone,
          },
        });
      }
      setJustSaved(true);
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
            {form.title || 'Agent bearbeiten'}
          </h1>
        </div>
        <div className="flex items-center gap-sm">
          {justSaved && <span className="text-sm text-foreground-muted">Gespeichert ✓</span>}
          {identifier && (
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

      {agent && <AgentConversionNotice agent={agent} className="mb-lg" />}

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

              <RecipePicker
                value={{ mention: form.defaultRecipeMention, id: form.defaultRecipeId }}
                onChange={(next) => {
                  setJustSaved(false);
                  setForm((prev) => ({
                    ...prev,
                    defaultRecipeMention: next.mention,
                    defaultRecipeId: next.id,
                  }));
                }}
              />

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
