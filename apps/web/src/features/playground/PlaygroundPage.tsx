import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../utils/cn';

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  category: string;
  reasoning: boolean;
}

interface PromptConfig {
  id: string;
  name: string;
  requestFields: string[];
  platforms: string[];
}

interface PanelState {
  model: ModelConfig | null;
  reasoningEffort: ReasoningEffort;
  output: string;
  reasoning: string;
  isReasoning: boolean;
  streaming: boolean;
  elapsed: number;
  error: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  inhalt: 'Inhalt / Thema',
  textForm: 'Textform',
  requestType: 'Antragstyp',
  gliederung: 'Gliederung / Absender*in',
  platform: 'Plattform',
  text: 'Text',
  zielgruppe: 'Zielgruppe',
  laenge: 'Gewünschte Länge',
  stil: 'Stil',
  kontext: 'Kontext',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  inhalt: 'Worum soll es gehen? Beschreibe das Thema, die politische Forderung oder den Anlass...',
  textForm: 'z.B. Pressemitteilung, Blogpost, Newsletter, Rede...',
  requestType: 'z.B. antrag, kleine_anfrage, grosse_anfrage',
  gliederung: 'z.B. Kreisverband Musterstadt',
  platform: 'z.B. facebook, twitter, instagram, linkedin',
  text: 'Ausgangstext eingeben...',
};

// ─── Memoized field input ────────────────────────────────────────────────

const FieldInput = memo(function FieldInput({
  field,
  value,
  onChange,
}: {
  field: string;
  value: string;
  onChange: (field: string, value: string) => void;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(field, e.target.value);
    },
    [field, onChange]
  );

  const isTextarea = field === 'inhalt' || field === 'text';

  return (
    <div className={isTextarea ? 'lg:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-grey-500">
        {FIELD_LABELS[field] || field}
      </label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={FIELD_PLACEHOLDERS[field] || ''}
          rows={3}
          className="w-full rounded-lg border border-grey-200 bg-background px-3 py-2 text-sm text-foreground placeholder:text-grey-400 dark:border-grey-700"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={FIELD_PLACEHOLDERS[field] || ''}
          className="w-full rounded-lg border border-grey-200 bg-background px-3 py-2 text-sm text-foreground placeholder:text-grey-400 dark:border-grey-700"
        />
      )}
    </div>
  );
});

// ─── Memoized output panel ───────────────────────────────────────────────

const OutputPanel = memo(function OutputPanel({
  panel,
  label,
  isLeft,
}: {
  panel: PanelState;
  label: string;
  isLeft: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden',
        isLeft ? 'border-r border-grey-200 dark:border-grey-700' : ''
      )}
    >
      <div className="flex items-center justify-between border-b border-grey-200 bg-background-alt px-4 py-2 dark:border-grey-700">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              panel.streaming
                ? 'animate-pulse bg-primary-500'
                : panel.output
                  ? 'bg-green-500'
                  : 'bg-grey-300 dark:bg-grey-600'
            )}
          />
          <span className="text-sm font-medium text-foreground">{panel.model?.name || label}</span>
          {panel.model && (
            <span className="rounded bg-grey-100 px-1.5 py-0.5 text-xs text-grey-500 dark:bg-grey-800">
              {panel.model.provider}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-grey-500">
          {panel.elapsed > 0 && (
            <span className="tabular-nums">{(panel.elapsed / 1000).toFixed(1)}s</span>
          )}
          {panel.output && <span className="tabular-nums">{panel.output.length} Zeichen</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {panel.error ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {panel.error}
          </div>
        ) : panel.output || panel.reasoning ? (
          <div className="space-y-3">
            {panel.reasoning && (
              <details open={panel.isReasoning && !panel.output} className="group">
                <summary className="cursor-pointer text-xs font-medium text-grey-400 select-none">
                  {panel.isReasoning ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                      Denkt...
                    </span>
                  ) : (
                    `Reasoning (${panel.reasoning.length} Zeichen)`
                  )}
                </summary>
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-grey-50 p-3 text-xs leading-relaxed text-grey-500 dark:bg-grey-800/50 dark:text-grey-400">
                  {panel.reasoning}
                </div>
              </details>
            )}
            {panel.output && (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
                {panel.output}
              </div>
            )}
          </div>
        ) : panel.streaming ? (
          <div className="flex items-center gap-2 text-sm text-grey-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
            Generiert...
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-grey-400">
            {panel.model ? 'Klicke "Generieren" um zu starten' : 'Wähle ein Modell aus'}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Memoized model selector ─────────────────────────────────────────────

const REASONING_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Aus' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];

const ModelSelector = memo(function ModelSelector({
  label,
  value,
  reasoningEffort,
  showReasoning,
  groupedModels,
  onChange,
  onReasoningChange,
}: {
  label: string;
  value: string;
  reasoningEffort: ReasoningEffort;
  showReasoning: boolean;
  groupedModels: Record<string, ModelConfig[]>;
  onChange: (value: string) => void;
  onReasoningChange: (value: ReasoningEffort) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-grey-500">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-grey-200 bg-background px-3 py-2 text-sm text-foreground dark:border-grey-700"
        >
          <option value="">Modell wählen...</option>
          {Object.entries(groupedModels).map(([category, categoryModels]) => (
            <optgroup key={category} label={category}>
              {categoryModels.map((m) => (
                <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                  {m.name}
                  {m.reasoning ? ' *' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {showReasoning && (
          <select
            value={reasoningEffort}
            onChange={(e) => onReasoningChange(e.target.value as ReasoningEffort)}
            className="w-[100px] shrink-0 rounded-lg border border-grey-200 bg-background px-2 py-2 text-xs text-foreground dark:border-grey-700"
            title="Reasoning Effort"
          >
            {REASONING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
});

// ─── Main page ───────────────────────────────────────────────────────────

function createEmptyPanel(): PanelState {
  return {
    model: null,
    reasoningEffort: 'medium',
    output: '',
    reasoning: '',
    isReasoning: false,
    streaming: false,
    elapsed: 0,
    error: null,
  };
}

function PlaygroundPage() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [panels, setPanels] = useState<[PanelState, PanelState]>([
    createEmptyPanel(),
    createEmptyPanel(),
  ]);

  const abortRefs = useRef<[AbortController | null, AbortController | null]>([null, null]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const selectedPromptRef = useRef(selectedPrompt);
  selectedPromptRef.current = selectedPrompt;

  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  useEffect(() => {
    fetch('/api/texte/playground/models', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => {});

    fetch('/api/texte/playground/prompts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.prompts || []) as PromptConfig[];
        setPrompts(list);
        const universal = list.find((p) => p.id === 'universal');
        if (universal) {
          setSelectedPrompt(universal);
          setFields(Object.fromEntries(universal.requestFields.map((f) => [f, ''])));
        }
      })
      .catch(() => {});
  }, []);

  const handlePromptChange = useCallback(
    (id: string) => {
      const prompt = prompts.find((p) => p.id === id);
      if (prompt) {
        setSelectedPrompt(prompt);
        setFields(Object.fromEntries(prompt.requestFields.map((f) => [f, ''])));
      }
    },
    [prompts]
  );

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleModelChangeA = useCallback(
    (modelId: string) => {
      const model = models.find((m) => `${m.provider}/${m.id}` === modelId) || null;
      setPanels((prev) => {
        const next = [...prev] as [PanelState, PanelState];
        next[0] = { ...next[0], model };
        return next;
      });
    },
    [models]
  );

  const handleModelChangeB = useCallback(
    (modelId: string) => {
      const model = models.find((m) => `${m.provider}/${m.id}` === modelId) || null;
      setPanels((prev) => {
        const next = [...prev] as [PanelState, PanelState];
        next[1] = { ...next[1], model };
        return next;
      });
    },
    [models]
  );

  const handleReasoningChangeA = useCallback((value: ReasoningEffort) => {
    setPanels((prev) => {
      const next = [...prev] as [PanelState, PanelState];
      next[0] = { ...next[0], reasoningEffort: value };
      return next;
    });
  }, []);

  const handleReasoningChangeB = useCallback((value: ReasoningEffort) => {
    setPanels((prev) => {
      const next = [...prev] as [PanelState, PanelState];
      next[1] = { ...next[1], reasoningEffort: value };
      return next;
    });
  }, []);

  const streamGenerate = useCallback(async (panelIdx: 0 | 1) => {
    const panel = panelsRef.current[panelIdx];
    const prompt = selectedPromptRef.current;
    if (!panel.model || !prompt) return;

    abortRefs.current[panelIdx]?.abort();
    const controller = new AbortController();
    abortRefs.current[panelIdx] = controller;

    setPanels((prev) => {
      const next = [...prev] as [PanelState, PanelState];
      next[panelIdx] = {
        ...next[panelIdx],
        output: '',
        reasoning: '',
        isReasoning: false,
        streaming: true,
        elapsed: 0,
        error: null,
      };
      return next;
    });

    const startTime = performance.now();
    const timerInterval = setInterval(() => {
      setPanels((prev) => {
        const next = [...prev] as [PanelState, PanelState];
        next[panelIdx] = { ...next[panelIdx], elapsed: Math.round(performance.now() - startTime) };
        return next;
      });
    }, 100);

    try {
      const response = await fetch('/api/texte/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          type: prompt.id,
          provider: panel.model.provider,
          model: panel.model.id,
          ...(panel.model.reasoning && panel.reasoningEffort !== 'medium'
            ? { reasoningEffort: panel.reasoningEffort }
            : {}),
          ...fieldsRef.current,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let fullReasoning = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith(': ')) continue; // heartbeat comment
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (currentEvent === 'reasoning_start') {
              setPanels((prev) => {
                const next = [...prev] as [PanelState, PanelState];
                next[panelIdx] = { ...next[panelIdx], isReasoning: true };
                return next;
              });
            } else if (currentEvent === 'reasoning_delta' && data.text) {
              fullReasoning += data.text;
              const currentReasoning = fullReasoning;
              setPanels((prev) => {
                const next = [...prev] as [PanelState, PanelState];
                next[panelIdx] = { ...next[panelIdx], reasoning: currentReasoning };
                return next;
              });
            } else if (currentEvent === 'reasoning_end') {
              setPanels((prev) => {
                const next = [...prev] as [PanelState, PanelState];
                next[panelIdx] = { ...next[panelIdx], isReasoning: false };
                return next;
              });
            } else if (currentEvent === 'text_delta' && data.text) {
              fullText += data.text;
              const currentText = fullText;
              setPanels((prev) => {
                const next = [...prev] as [PanelState, PanelState];
                next[panelIdx] = { ...next[panelIdx], output: currentText };
                return next;
              });
            } else if (data.text && !currentEvent) {
              // Fallback for events without event: prefix
              fullText += data.text;
              const currentText = fullText;
              setPanels((prev) => {
                const next = [...prev] as [PanelState, PanelState];
                next[panelIdx] = { ...next[panelIdx], output: currentText };
                return next;
              });
            }

            if (data.error) throw new Error(data.error);
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }

          currentEvent = '';
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return;
      setPanels((prev) => {
        const next = [...prev] as [PanelState, PanelState];
        next[panelIdx] = { ...next[panelIdx], error: (e as Error).message };
        return next;
      });
    } finally {
      clearInterval(timerInterval);
      setPanels((prev) => {
        const next = [...prev] as [PanelState, PanelState];
        next[panelIdx] = {
          ...next[panelIdx],
          streaming: false,
          elapsed: Math.round(performance.now() - startTime),
        };
        return next;
      });
    }
  }, []);

  const handleGenerate = useCallback(() => {
    if (panelsRef.current[0].model) streamGenerate(0);
    if (panelsRef.current[1].model) streamGenerate(1);
  }, [streamGenerate]);

  const handleStop = useCallback(() => {
    abortRefs.current[0]?.abort();
    abortRefs.current[1]?.abort();
  }, []);

  const isAnyStreaming = panels[0].streaming || panels[1].streaming;
  const canGenerate =
    selectedPrompt &&
    (panels[0].model || panels[1].model) &&
    Object.values(fields).some((v) => v.trim());

  const groupedModels = useMemo(
    () =>
      models.reduce<Record<string, ModelConfig[]>>((acc, m) => {
        (acc[m.category] ??= []).push(m);
        return acc;
      }, {}),
    [models]
  );

  const modelAValue = panels[0].model ? `${panels[0].model.provider}/${panels[0].model.id}` : '';
  const modelBValue = panels[1].model ? `${panels[1].model.provider}/${panels[1].model.id}` : '';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header bar */}
      <div className="border-b border-grey-200 bg-background-alt px-6 py-4 dark:border-grey-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Playground</h1>
            <p className="text-sm text-grey-500">
              Vergleiche Prompts und Agents mit verschiedenen Modellen
            </p>
          </div>
          <div className="flex gap-2">
            {isAnyStreaming ? (
              <button
                onClick={handleStop}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Stoppen
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                  canGenerate
                    ? 'bg-primary-600 hover:bg-primary-700'
                    : 'cursor-not-allowed bg-grey-300 dark:bg-grey-700'
                )}
              >
                Generieren
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Config section */}
      <div className="border-b border-grey-200 bg-background px-6 py-4 dark:border-grey-700">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-grey-500">
              Generator
            </label>
            <select
              value={selectedPrompt?.id || ''}
              onChange={(e) => handlePromptChange(e.target.value)}
              className="w-full rounded-lg border border-grey-200 bg-background px-3 py-2 text-sm text-foreground dark:border-grey-700"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <ModelSelector
            label="Modell A"
            value={modelAValue}
            reasoningEffort={panels[0].reasoningEffort}
            showReasoning={!!panels[0].model?.reasoning}
            groupedModels={groupedModels}
            onChange={handleModelChangeA}
            onReasoningChange={handleReasoningChangeA}
          />
          <ModelSelector
            label="Modell B"
            value={modelBValue}
            reasoningEffort={panels[1].reasoningEffort}
            showReasoning={!!panels[1].model?.reasoning}
            groupedModels={groupedModels}
            onChange={handleModelChangeB}
            onReasoningChange={handleReasoningChangeB}
          />
        </div>

        {selectedPrompt && (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {selectedPrompt.requestFields.map((field) => (
              <FieldInput
                key={field}
                field={field}
                value={fields[field] || ''}
                onChange={handleFieldChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Output panels */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <OutputPanel panel={panels[0]} label="Modell A" isLeft />
        <OutputPanel panel={panels[1]} label="Modell B" isLeft={false} />
      </div>
    </div>
  );
}

export default PlaygroundPage;
