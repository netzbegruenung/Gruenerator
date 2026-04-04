import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  CollapsibleSection,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@gruenerator/ui';
import { Beaker, BrainCircuit, Cpu, ImagePlus, Play, Square, Trash2, Type } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../utils/cn';

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

const PANEL_STYLES = [
  { accent: 'border-l-primary-500', dot: 'bg-primary-500', label: 'A' },
  { accent: 'border-l-secondary-500', dot: 'bg-secondary-500', label: 'B' },
] as const;

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
      <Label className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field}</Label>
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
  const style = PANEL_STYLES[panelIndex];

  if (!panel.model) {
    return (
      <Card className={cn('flex-1 border-l-4', style.accent)}>
        <CardContent className="flex-1">
          <Empty className="h-full min-h-[200px] border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Cpu />
              </EmptyMedia>
              <EmptyTitle>Modell {style.label}</EmptyTitle>
              <EmptyDescription>
                Wähle ein Modell aus, um Ergebnisse zu vergleichen
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-1 flex-col border-l-4 overflow-hidden', style.accent)}>
      <CardHeader className="border-b border-grey-200 dark:border-grey-700">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block size-2 shrink-0 rounded-full transition-colors',
              panel.streaming
                ? cn('animate-pulse', style.dot)
                : panel.output
                  ? 'bg-green-500'
                  : 'bg-grey-300 dark:bg-grey-600'
            )}
          />
          <CardTitle className="text-sm">{panel.model.name}</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {panel.model.provider}
          </Badge>
          {panel.streaming && <Badge className="animate-pulse text-[10px]">Generiert...</Badge>}
        </div>
        <CardAction>
          <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            {panel.elapsed > 0 && <span>{(panel.elapsed / 1000).toFixed(1)}s</span>}
            {panel.output && <span>{panel.output.length} Zeichen</span>}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-4">
        {panel.error ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {panel.error}
          </div>
        ) : panel.output || panel.reasoning ? (
          <div className="space-y-3">
            {panel.reasoning && (
              <details open={panel.isReasoning && !panel.output} className="group">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
                  {panel.isReasoning ? (
                    <>
                      <span className="inline-block size-3 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                      Denkt...
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="size-3" />
                      Reasoning ({panel.reasoning.length} Zeichen)
                    </>
                  )}
                </summary>
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-grey-50 p-3 text-xs leading-relaxed text-muted-foreground dark:bg-grey-800/50">
                  {panel.reasoning}
                </div>
              </details>
            )}
            {panel.output && (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
                {panel.output}
              </div>
            )}
            {panel.ocrText && (
              <details className="group">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
                  <Type className="size-3" />
                  Extrahierter Text (OCR)
                </summary>
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-grey-50 p-3 text-xs leading-relaxed text-muted-foreground dark:bg-grey-800/50">
                  {panel.ocrText}
                </div>
              </details>
            )}
          </div>
        ) : panel.streaming ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
            Generiert...
          </div>
        ) : (
          <Empty className="h-full min-h-[120px] border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Play />
              </EmptyMedia>
              <EmptyDescription>Klicke &quot;Generieren&quot; um zu starten</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
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
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Select value={value || '_none'} onValueChange={(v) => onChange(v === '_none' ? '' : v)}>
          <SelectTrigger className="w-full min-w-0">
            <SelectValue placeholder="Modell wählen..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Modell wählen...</SelectItem>
            {Object.entries(groupedModels).map(([category, categoryModels]) => (
              <SelectGroup key={category}>
                <SelectLabel>{category}</SelectLabel>
                {categoryModels.map((m) => (
                  <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                    {m.name}
                    {m.reasoning ? ' *' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
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
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
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
    fetch('/api/texte/playground/models', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => {});

    fetch('/api/texte/playground/prompts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.prompts || []) as PromptConfig[];
        setPrompts(list);
        const initial = list.find((p) => p.id === 'free') || list[0];
        if (initial) {
          setSelectedPrompt(initial);
          setFields(Object.fromEntries(initial.fields.map((f) => [f, ''])));
        }
      })
      .catch(() => {});
  }, []);

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

        const response = await fetch('/api/vision/analyze', {
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
        const data = await response.json();

        updatePanel(panelIdx, {
          output: data.description || '',
          ocrText: data.extractedText || null,
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
            if (line.startsWith(': ')) continue;
            if (!line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6));

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
        visionAnalyze(idx);
      } else {
        streamGenerate(idx);
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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-md px-lg pb-xl pt-lg max-md:px-md">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-sm text-2xl font-semibold text-foreground-heading">
            <Beaker className="size-6 text-primary-600" />
            Playground
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vergleiche Prompts und Agents mit verschiedenen Modellen
          </p>
        </div>
        <div className="flex gap-2">
          {isAnyStreaming ? (
            <Button variant="brand-danger" size="brand-sm" onClick={handleStop}>
              <Square className="size-3.5" />
              Stoppen
            </Button>
          ) : (
            <Button
              variant="brand"
              size="brand-sm"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <Play className="size-3.5" />
              Generieren
            </Button>
          )}
        </div>
      </div>

      {/* Config card */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-md lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Modus</Label>
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
        </CardContent>

        {selectedPrompt && (
          <CardContent className="pt-0">
            <CollapsibleSection title="Eingabefelder" defaultOpen bordered>
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
            </CollapsibleSection>
          </CardContent>
        )}
      </Card>

      {/* Image upload — shown when at least one vision model is selected */}
      {hasVisionModel && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-md">
              {imageData ? (
                <div className="flex items-center gap-sm">
                  <img
                    src={imageData}
                    alt="Vorschau"
                    className="size-16 rounded-md border border-grey-200 object-cover dark:border-grey-700"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Bild angehängt</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <Trash2 className="size-3" />
                      Entfernen
                    </Button>
                  </div>
                </div>
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
              <span className="text-xs text-muted-foreground">
                Vision-Modelle analysieren das Bild und extrahieren Text via OCR
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output panels */}
      <div className="grid min-h-[400px] grid-cols-1 gap-md lg:grid-cols-2">
        <OutputPanel panel={panels[0]} panelIndex={0} />
        <OutputPanel panel={panels[1]} panelIndex={1} />
      </div>
    </div>
  );
}

export default PlaygroundPage;
