import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { BrainCircuit, ImagePlus, Play, Square, Trash2, Type } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../utils/cn';
import { platformFetch } from '../../utils/platformFetch';

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  category: string;
  reasoning: boolean;
  vision: boolean;
}

interface PromptConfig {
  id: string;
  name: string;
  description: string;
  fields: string[];
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
  ocrText: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  systemPrompt: 'System-Prompt',
  userMessage: 'Nachricht',
  inhalt: 'Inhalt / Thema',
  textForm: 'Textform',
  originalText: 'Ausgangstext',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  systemPrompt: 'Du bist ein hilfreicher Assistent...',
  userMessage: 'Schreibe eine Nachricht an das Modell...',
  inhalt: 'Worum soll es gehen? Beschreibe das Thema, die politische Forderung oder den Anlass...',
  textForm: 'z.B. Pressemitteilung, Blogpost, Newsletter, Rede...',
  originalText: 'Den zu übersetzenden Text hier eingeben...',
};

const REASONING_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Aus' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];

const PANEL_DOTS = ['bg-primary-500', 'bg-secondary-500'] as const;

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

  const isTextarea =
    field === 'systemPrompt' ||
    field === 'userMessage' ||
    field === 'inhalt' ||
    field === 'originalText';

  return (
    <div className={cn('flex flex-col gap-1.5', isTextarea && 'lg:col-span-2')}>
      <span className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field}</span>
      {isTextarea ? (
        <Textarea
          value={value}
          onChange={handleChange}
          placeholder={FIELD_PLACEHOLDERS[field] || ''}
          rows={3}
        />
      ) : (
        <Input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={FIELD_PLACEHOLDERS[field] || ''}
        />
      )}
    </div>
  );
});

// ─── Memoized output panel ───────────────────────────────────────────────

const OutputPanel = memo(function OutputPanel({
  panel,
  panelIndex,
}: {
  panel: PanelState;
  panelIndex: 0 | 1;
}) {
  const hasContent = panel.output || panel.reasoning || panel.error || panel.streaming;

  if (!panel.model || !hasContent) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-grey-200 dark:border-grey-700">
      <div className="flex items-center justify-between border-b border-grey-200 px-4 py-2.5 dark:border-grey-700">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              'size-2 rounded-full',
              panel.streaming
                ? cn('animate-pulse', PANEL_DOTS[panelIndex])
                : panel.error
                  ? 'bg-red-500'
                  : 'bg-green-500'
            )}
          />
          {panel.model.name}
          <span className="text-[10px] font-normal text-muted-foreground">
            {panel.model.provider}
          </span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {(panel.elapsed / 1000).toFixed(1)}s{panel.output && ` · ${panel.output.length} Zeichen`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {panel.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{panel.error}</p>
        ) : panel.output || panel.reasoning ? (
          <>
            {panel.reasoning && (
              <details open={panel.isReasoning && !panel.output}>
                <summary className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                  {panel.isReasoning ? (
                    <>
                      <span className="size-3 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                      Denkt...
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="size-3" />
                      Reasoning ({panel.reasoning.length} Zeichen)
                    </>
                  )}
                </summary>
                <pre className="mb-3 whitespace-pre-wrap rounded-md bg-grey-50 p-3 text-xs leading-relaxed text-muted-foreground dark:bg-grey-800/50">
                  {panel.reasoning}
                </pre>
              </details>
            )}
            {panel.output && (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
                {panel.output}
              </div>
            )}
            {panel.ocrText && (
              <details className="mt-3">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                  <Type className="size-3" />
                  OCR-Text
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-grey-50 p-3 text-xs leading-relaxed text-muted-foreground dark:bg-grey-800/50">
                  {panel.ocrText}
                </pre>
              </details>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
            {(panel.elapsed / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Memoized model selector ─────────────────────────────────────────────

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
  const handleValueChange = useCallback(
    (newValue: string | null) => {
      onChange(newValue ?? '');
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <Combobox value={value || null} onValueChange={handleValueChange}>
          <ComboboxInput placeholder="Modell suchen..." />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxEmpty>Kein Modell gefunden</ComboboxEmpty>
              {Object.entries(groupedModels).map(([category, categoryModels]) => (
                <ComboboxGroup key={category}>
                  <ComboboxLabel>{category}</ComboboxLabel>
                  {categoryModels.map((m) => (
                    <ComboboxItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                      {m.name}
                      {m.reasoning ? ' *' : ''}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {showReasoning && (
          <Select
            value={reasoningEffort}
            onValueChange={(v) => onReasoningChange(v as ReasoningEffort)}
          >
            <SelectTrigger className="w-[100px] shrink-0" size="sm">
              <BrainCircuit className="size-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONING_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
    ocrText: null,
  };
}

function PlaygroundPage() {
  const { data: models = [] } = useQuery<ModelConfig[]>({
    queryKey: ['playground', 'models'],
    queryFn: async () => {
      const res = await platformFetch('/api/texte/playground/models', { credentials: 'include' });
      const json = (await res.json()) as { models?: ModelConfig[] };
      return json.models ?? [];
    },
    staleTime: Infinity,
  });

  const { data: prompts = [] } = useQuery<PromptConfig[]>({
    queryKey: ['playground', 'prompts'],
    queryFn: async () => {
      const res = await platformFetch('/api/texte/playground/prompts', { credentials: 'include' });
      const json = (await res.json()) as { prompts?: PromptConfig[] };
      return json.prompts ?? [];
    },
    staleTime: Infinity,
  });

  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [panels, setPanels] = useState<[PanelState, PanelState]>([
    createEmptyPanel(),
    createEmptyPanel(),
  ]);
  const [imageData, setImageData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const abortRefs = useRef<[AbortController | null, AbortController | null]>([null, null]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const selectedPromptRef = useRef(selectedPrompt);
  selectedPromptRef.current = selectedPrompt;

  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  useEffect(() => {
    if (selectedPrompt || prompts.length === 0) return;
    const initial = prompts.find((p) => p.id === 'free') ?? prompts[0];
    if (initial) {
      setSelectedPrompt(initial);
      setFields(Object.fromEntries(initial.fields.map((f) => [f, ''])));
    }
  }, [prompts, selectedPrompt]);

  const handlePromptChange = useCallback(
    (id: string) => {
      const prompt = prompts.find((p) => p.id === id);
      if (prompt) {
        setSelectedPrompt(prompt);
        setFields(Object.fromEntries(prompt.fields.map((f) => [f, ''])));
      }
    },
    [prompts]
  );

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updatePanel = useCallback((idx: 0 | 1, patch: Partial<PanelState>) => {
    setPanels((prev) => {
      const next = [...prev] as [PanelState, PanelState];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const handleModelChangeA = useCallback(
    (modelId: string) => {
      const model = models.find((m) => `${m.provider}/${m.id}` === modelId) || null;
      updatePanel(0, { model });
    },
    [models, updatePanel]
  );

  const handleModelChangeB = useCallback(
    (modelId: string) => {
      const model = models.find((m) => `${m.provider}/${m.id}` === modelId) || null;
      updatePanel(1, { model });
    },
    [models, updatePanel]
  );

  const handleReasoningChangeA = useCallback(
    (value: ReasoningEffort) => updatePanel(0, { reasoningEffort: value }),
    [updatePanel]
  );

  const handleReasoningChangeB = useCallback(
    (value: ReasoningEffort) => updatePanel(1, { reasoningEffort: value }),
    [updatePanel]
  );

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleRemoveImage = useCallback(() => setImageData(null), []);

  const imageDataRef = useRef(imageData);
  imageDataRef.current = imageData;

  const visionAnalyze = useCallback(
    async (panelIdx: 0 | 1) => {
      const panel = panelsRef.current[panelIdx];
      if (!panel.model || !imageDataRef.current) return;

      abortRefs.current[panelIdx]?.abort();
      const controller = new AbortController();
      abortRefs.current[panelIdx] = controller;

      updatePanel(panelIdx, {
        output: '',
        reasoning: '',
        isReasoning: false,
        streaming: true,
        elapsed: 0,
        error: null,
        ocrText: null,
      });

      const startTime = performance.now();

      try {
        const instruction =
          Object.values(fieldsRef.current).filter(Boolean).join('\n') ||
          'Beschreibe dieses Bild detailliert. Was ist darauf zu sehen?';

        const response = await platformFetch('/api/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            image: imageDataRef.current,
            instruction,
            provider: panel.model.provider,
            model: panel.model.id,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { description?: string; extractedText?: string };

        updatePanel(panelIdx, {
          output: data.description ?? '',
          ocrText: data.extractedText ?? null,
        });
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') return;
        updatePanel(panelIdx, { error: (e as Error).message });
      } finally {
        updatePanel(panelIdx, {
          streaming: false,
          elapsed: Math.round(performance.now() - startTime),
        });
      }
    },
    [updatePanel]
  );

  const streamGenerate = useCallback(
    async (panelIdx: 0 | 1) => {
      const panel = panelsRef.current[panelIdx];
      const prompt = selectedPromptRef.current;
      if (!panel.model || !prompt) return;

      abortRefs.current[panelIdx]?.abort();
      const controller = new AbortController();
      abortRefs.current[panelIdx] = controller;

      updatePanel(panelIdx, {
        output: '',
        reasoning: '',
        isReasoning: false,
        streaming: true,
        elapsed: 0,
        error: null,
        ocrText: null,
      });

      const startTime = performance.now();
      const timerInterval = setInterval(() => {
        updatePanel(panelIdx, { elapsed: Math.round(performance.now() - startTime) });
      }, 500);

      try {
        const response = await platformFetch('/api/texte/playground/generate', {
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
            if (line.startsWith(': ')) continue;
            if (!line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6)) as { text?: string; error?: string };

              if (currentEvent === 'reasoning_start') {
                updatePanel(panelIdx, { isReasoning: true });
              } else if (currentEvent === 'reasoning_delta' && data.text) {
                fullReasoning += data.text;
                updatePanel(panelIdx, { reasoning: fullReasoning });
              } else if (currentEvent === 'reasoning_end') {
                updatePanel(panelIdx, { isReasoning: false });
              } else if ((currentEvent === 'text_delta' || !currentEvent) && data.text) {
                fullText += data.text;
                updatePanel(panelIdx, { output: fullText });
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
        updatePanel(panelIdx, { error: (e as Error).message });
      } finally {
        clearInterval(timerInterval);
        updatePanel(panelIdx, {
          streaming: false,
          elapsed: Math.round(performance.now() - startTime),
        });
      }
    },
    [updatePanel]
  );

  const handleGenerate = useCallback(() => {
    const hasImage = !!imageDataRef.current;
    for (const idx of [0, 1] as const) {
      const panel = panelsRef.current[idx];
      if (!panel.model) continue;
      if (hasImage && panel.model.vision) {
        void visionAnalyze(idx);
      } else {
        void streamGenerate(idx);
      }
    }
  }, [streamGenerate, visionAnalyze]);

  const handleStop = useCallback(() => {
    abortRefs.current[0]?.abort();
    abortRefs.current[1]?.abort();
  }, []);

  const isAnyStreaming = panels[0].streaming || panels[1].streaming;
  const hasVisionModel = panels.some((p) => p.model?.vision);
  const canGenerate =
    (panels[0].model || panels[1].model) &&
    (Object.values(fields).some((v) => v.trim()) || imageData);

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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-lg px-lg pb-xl pt-lg max-md:px-md">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground-heading">Playground</h1>
        {isAnyStreaming ? (
          <Button variant="brand-danger" size="brand-sm" onClick={handleStop}>
            <Square className="size-3.5" />
            Stoppen
          </Button>
        ) : (
          <Button variant="brand" size="brand-sm" onClick={handleGenerate} disabled={!canGenerate}>
            <Play className="size-3.5" />
            Generieren
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Modus</span>
          <Select value={selectedPrompt?.id || ''} onValueChange={handlePromptChange}>
            <SelectTrigger className="w-full">
              <Type className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Modus wählen..." />
            </SelectTrigger>
            <SelectContent>
              {prompts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="grid grid-cols-1 gap-sm lg:grid-cols-2">
          {selectedPrompt.fields.map((field) => (
            <FieldInput
              key={field}
              field={field}
              value={fields[field] || ''}
              onChange={handleFieldChange}
            />
          ))}
        </div>
      )}

      {hasVisionModel && (
        <div className="flex items-center gap-sm">
          {imageData ? (
            <>
              <img
                src={imageData}
                alt="Vorschau"
                className="size-12 rounded-md border border-grey-200 object-cover dark:border-grey-700"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveImage}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Trash2 className="size-3" />
                Entfernen
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <ImagePlus className="size-3.5" />
              Bild hinzufügen
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {panels.some((p) => p.model && (p.output || p.reasoning || p.error || p.streaming)) && (
        <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
          <OutputPanel panel={panels[0]} panelIndex={0} />
          <OutputPanel panel={panels[1]} panelIndex={1} />
        </div>
      )}
    </div>
  );
}

export default PlaygroundPage;
