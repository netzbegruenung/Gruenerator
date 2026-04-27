import { useCanvasEditorServices, useCanvasStoreSelector } from '@gruenerator/canvas-editor';
import {
  CompactThread,
  CompactWelcome,
  NotebookChatProvider,
  type SharepicContext,
} from '@gruenerator/chat';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useNotebookStore from '../notebook/stores/notebookStore';

import type { CanvasAiEditBridge, ChatSectionContentProps } from '@gruenerator/canvas-editor';
import type { CanvasAiSuggestion } from '@gruenerator/contracts';

const QUICK_PROMPTS = [
  'Mach das Zitat schlagkräftiger',
  'Kürze den Text',
  'Schlag ein anderes Farbschema vor',
  'Recherchiere passende Fakten dazu',
];

const SHAREPIC_SYSTEM_PROMPT = `Du bist Assistent*in für die Sharepic-Bearbeitung von Bündnis 90/Die Grünen. Der*die Nutzer*in arbeitet gerade an einem Sharepic, das du als Bild und als strukturierten Text beigefügt bekommst.

- Beantworte Fragen zu Inhalt, Wirkung, Zielgruppe und politischer Einordnung.
- Recherchiere bei Bedarf in den verbundenen Dokumenten und im Web und nutze Zitationen.
- Schlage alternative Formulierungen oder Texte vor, wenn das hilft.
- Antworte in informellem Du-Stil und mit Genderstern (*in / *innen).

Wichtig: Deine Recherche-Ergebnisse fließen automatisch in einen separaten Bearbeitungs­vorschlag ein, der direkt am Canvas erscheint. Liefere also fundierte, konkrete Texte und Zahlen — sie werden für die Bearbeitung wiederverwendet.`;

interface CanvasOperationsEvent {
  suggestions: CanvasAiSuggestion[];
}

interface CanvasOperationsErrorEvent {
  error: string;
}

export function CanvasInlineChatSection({
  aiEdit,
  canvasType: _canvasType,
  captureCanvasImage,
  getSharepicText,
}: ChatSectionContentProps) {
  const services = useCanvasEditorServices();
  const useGenerator = services.useGenerateCanvasSuggestions;

  const qaCollections = useNotebookStore((s) => s.qaCollections);
  const fetchQACollections = useNotebookStore((s) => s.fetchQACollections);

  useEffect(() => {
    if (qaCollections.length === 0) void fetchQACollections();
  }, [qaCollections.length, fetchQACollections]);

  const collections = useMemo(
    () => qaCollections.map((c) => ({ id: c.id, name: c.name })),
    [qaCollections]
  );

  const sharepicContext: SharepicContext = useMemo(
    () => ({
      captureImage: captureCanvasImage,
      getText: getSharepicText,
      systemPrompt: SHAREPIC_SYSTEM_PROMPT,
    }),
    [captureCanvasImage, getSharepicText]
  );

  if (!useGenerator || !aiEdit) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
        Chat ist für diese Vorlage nicht verfügbar.
      </div>
    );
  }

  return (
    <CanvasChatBody aiEdit={aiEdit} collections={collections} sharepicContext={sharepicContext} />
  );
}

interface CanvasChatBodyProps {
  aiEdit: CanvasAiEditBridge;
  collections: Array<{ id: string; name: string }>;
  sharepicContext: SharepicContext;
}

function CanvasChatBody({ aiEdit, collections, sharepicContext }: CanvasChatBodyProps) {
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Refs so the SSE callback always reads the latest aiEdit / setter without
  // forcing the NotebookChatProvider's adapter to recreate on every render.
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;
  const setPendingAiSuggestionRef = useRef(setPendingAiSuggestion);
  setPendingAiSuggestionRef.current = setPendingAiSuggestion;

  const getExtraParams = useCallback(
    () => ({
      canvasSnapshot: aiEditRef.current.getSnapshot(),
      canvasCapabilities: aiEditRef.current.capabilityList,
    }),
    []
  );

  const onCustomEvent = useCallback((event: string, data: unknown) => {
    switch (event) {
      case 'canvas_operations_start': {
        setApplying(true);
        setApplyError(null);
        // Auto-accept any prior pending suggestion so the new one isn't
        // shadowed by a stale banner.
        setPendingAiSuggestionRef.current(null);
        break;
      }
      case 'canvas_operations': {
        setApplying(false);
        const payload = data as CanvasOperationsEvent;
        const first = payload.suggestions[0];
        if (!first) return;
        aiEditRef.current.applyOperations(first.operations);
        setPendingAiSuggestionRef.current({ title: first.title });
        break;
      }
      case 'canvas_operations_error': {
        setApplying(false);
        const { error } = data as CanvasOperationsErrorEvent;
        setApplyError(error);
        break;
      }
    }
  }, []);

  return (
    <NotebookChatProvider
      collections={collections}
      sharepicContext={sharepicContext}
      endpoint="/api/canvas/chat-edit/stream"
      getExtraParams={getExtraParams}
      onCustomEvent={onCustomEvent}
    >
      <div className="flex h-full min-h-0 flex-col">
        <CompactThread
          welcome={
            <CompactWelcome
              icon={<Sparkles className="size-6 text-primary" />}
              description="Stelle Fragen zu deinem Sharepic oder beschreibe direkt eine Änderung. Recherche und Zitate fließen automatisch in den Bearbeitungs­vorschlag oben am Canvas ein."
              suggestions={QUICK_PROMPTS}
            />
          }
          assistantIcon={<Sparkles className="size-3.5" />}
          composerPlaceholder="Frage stellen oder Änderung beschreiben…"
        />
        <CanvasEditStatusRow applying={applying} error={applyError} />
      </div>
    </NotebookChatProvider>
  );
}

function CanvasEditStatusRow({ applying, error }: { applying: boolean; error: string | null }) {
  if (applying) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-background-alt px-3 py-1.5 text-[11px] text-foreground-muted">
        <Sparkles className="size-3 animate-pulse text-primary" aria-hidden="true" />
        Bearbeitungs­vorschlag wird erstellt…
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="border-t border-border bg-red-50 px-3 py-1.5 text-[11px] text-red-700"
      >
        Bearbeitung: {error}
      </div>
    );
  }
  return null;
}
