import { useCanvasEditorServices, useCanvasStoreSelector } from '@gruenerator/canvas-editor';
import { ArrowUp, Sparkles, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CanvasAiEditBridge, ChatSectionContentProps } from '@gruenerator/canvas-editor';
import type { CanvasAiSuggestion } from '@gruenerator/contracts';

const QUICK_PROMPTS = [
  'Mach das Zitat schlagkräftiger',
  'Kürze den Text',
  'Schlag ein anderes Farbschema vor',
];

interface ThreadEntry {
  id: string;
  prompt: string;
  status: 'loading' | 'applied' | 'empty' | 'error';
  appliedSuggestion?: CanvasAiSuggestion;
  alternatives?: CanvasAiSuggestion[];
  error?: string;
}

export function CanvasInlineChatSection({ aiEdit, canvasType }: ChatSectionContentProps) {
  const services = useCanvasEditorServices();
  const useGenerator = services.useGenerateCanvasSuggestions;

  if (!aiEdit || !useGenerator) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
        Chat ist für diese Vorlage nicht verfügbar.
      </div>
    );
  }

  return <CanvasEditChat aiEdit={aiEdit} canvasType={canvasType} useGenerator={useGenerator} />;
}

interface CanvasEditChatProps {
  canvasType: string;
  aiEdit: CanvasAiEditBridge;
  useGenerator: NonNullable<
    ReturnType<typeof useCanvasEditorServices>['useGenerateCanvasSuggestions']
  >;
}

function CanvasEditChat({ canvasType, aiEdit, useGenerator }: CanvasEditChatProps) {
  // Single hook instance — re-invoking useGenerator() creates separate state.
  const { suggestions, loading, error, generate } = useGenerator();
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [composerText, setComposerText] = useState('');
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;

  // Setter for the top-bar banner state. Revert is handled by the canvas's
  // standard undo() inside the banner — no history bookkeeping here.
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  const pendingEntryIdRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(false);

  const submit = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || loading) return;

      // Auto-accept any previous pending suggestion before kicking off a new
      // request. Avoids dangling banner state and keeps each request "clean".
      setPendingAiSuggestion(null);

      const id = crypto.randomUUID();
      const entry: ThreadEntry = { id, prompt: text, status: 'loading' };
      pendingEntryIdRef.current = id;
      setEntries((prev) => [...prev, entry]);
      setComposerText('');

      const ai = aiEditRef.current;
      void generate(text, {
        canvasType,
        canvasState: ai.getSnapshot(),
        capabilities: ai.capabilityList,
      });
    },
    [loading, generate, canvasType, setPendingAiSuggestion]
  );

  // When the generator transitions loading → idle, auto-apply the first
  // suggestion, capture the pre-apply historyIndex, and surface the banner.
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (!wasLoading || loading) return;
    const pendingId = pendingEntryIdRef.current;
    if (!pendingId) return;
    pendingEntryIdRef.current = null;

    if (error) {
      setEntries((prev) =>
        prev.map((e) => (e.id === pendingId ? { ...e, status: 'error', error } : e))
      );
      return;
    }

    const first = suggestions[0];
    if (!first) {
      setEntries((prev) => prev.map((e) => (e.id === pendingId ? { ...e, status: 'empty' } : e)));
      return;
    }

    aiEditRef.current.applyOperations(first.operations);
    setPendingAiSuggestion({ title: first.title });

    setEntries((prev) =>
      prev.map((e) =>
        e.id === pendingId
          ? {
              ...e,
              status: 'applied',
              appliedSuggestion: first,
              alternatives: suggestions.slice(1),
            }
          : e
      )
    );
    // suggestions/error read at the loading→idle transition; deps intentionally
    // limited to `loading` so we don't re-resolve on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0 ? (
          <Welcome onPick={(text) => submit(text)} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {entries.map((entry) => (
              <EntryView key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
      <Composer
        value={composerText}
        onChange={setComposerText}
        onSubmit={() => submit(composerText)}
        busy={loading}
      />
    </div>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center px-2 pt-6 pb-4 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Sparkles className="size-6 text-primary" />
      </div>
      <p className="mb-4 text-sm text-foreground-muted">
        Beschreibe, was du an deinem Sharepic ändern möchtest. Die KI wendet ihren Vorschlag direkt
        an — du entscheidest oben, ob du ihn behältst.
      </p>
      <div className="flex w-full flex-col gap-1.5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function EntryView({ entry }: { entry: ThreadEntry }) {
  return (
    <li className="flex flex-col gap-2 text-left">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs text-white">
          {entry.prompt}
        </div>
      </div>
      {entry.status === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <Sparkles className="size-3.5 animate-pulse text-primary" />
          Vorschlag wird erstellt…
        </div>
      )}
      {entry.status === 'error' && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          {entry.error}
        </div>
      )}
      {entry.status === 'empty' && (
        <div className="text-xs text-foreground-muted">Keine Vorschläge erhalten.</div>
      )}
      {entry.status === 'applied' && entry.appliedSuggestion && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-background-alt p-2 text-xs">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">{entry.appliedSuggestion.title}</div>
            {entry.appliedSuggestion.description && (
              <div className="mt-0.5 text-foreground-muted">
                {entry.appliedSuggestion.description}
              </div>
            )}
            <div className="mt-1 text-[10px] text-foreground-muted">
              Übernommen — oben „Behalten" oder „Verwerfen" wählen.
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}

function Composer({ value, onChange, onSubmit, busy }: ComposerProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="border-t border-border p-2">
      <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-2">
        <textarea
          autoFocus
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Beschreibe, was du ändern willst…"
          className="min-h-10 max-h-28 flex-grow resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-xs leading-snug text-foreground outline-none placeholder:text-foreground-muted"
        />
        {busy ? (
          <button
            type="button"
            disabled
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-error text-white opacity-60"
            aria-label="Wird verarbeitet"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={value.trim().length === 0}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-30"
            aria-label="Senden"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
