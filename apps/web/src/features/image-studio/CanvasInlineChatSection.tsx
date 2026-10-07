'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: the live canvas bridge + text getter are mirrored into
   refs so the memoized adapter's edit handler reads fresh values. */
import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { useCanvasStore, useCanvasStoreSelector } from '@gruenerator/canvas-editor';
import { applySharepicPatch } from '@gruenerator/canvas-editor/composer';
import {
  CompactThread,
  CompactWelcome,
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { ArrowUp, Sparkles, Square } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { applyCanvasEditorOps, describeCanvasEditorOpsOutcome } from './applyCanvasEditorOps';
import {
  applySpecEdit,
  describeSpecEdit,
  reviewPatchForEdit,
  specEditContext,
} from './applySpecEdit';
import { useCanvasChatDoc } from './CanvasChatDocContext';
import { checkEditedCanvas, nextPaint } from './canvasEditCheck';
import { composeCreatorSharepic } from './freitext/composeForRender';
import { contactSheet, renderPreviews } from './freitext/creatorRender';
import { knownSelectionIds } from './knownSelectionIds';

import type {
  CanvasAiEditBridge,
  CanvasSpecEditBridge,
  ChatSectionContentProps,
} from '@gruenerator/canvas-editor';
import type { EditorOperationsEvent, SharepicSpec } from '@gruenerator/contracts';

// Same architecture as the sheets/presentations/boards editors: the main chat
// pipeline (ChatGraph) with a dedicated editor agent, editing through the
// agentic loop's `edit_document` tool (plan-and-send). The sharepic text,
// snapshot and capabilities flow up through the `currentCanvas` context
// channel; the planned ops come back as an `editor_operations` SSE event and
// are applied to the live canvas here — no notebook anywhere.
const AGENT_ID = 'gruenerator-sharepic-editor';

// Canvas chat is only mounted inside the (authed) studio and never collaborates,
// so a stable sentinel satisfies the provider's render gate without a real user.
const CANVAS_USER_ID = 'canvas-editor';

const QUICK_PROMPTS = [
  'Mach das Zitat schlagkräftiger',
  'Kürze den Text',
  'Schlag ein anderes Farbschema vor',
  'Recherchiere passende Fakten dazu',
];

export function CanvasInlineChatSection({
  aiEdit,
  canvasType,
  getSharepicText,
  captureCanvasImage,
  specEdit,
}: ChatSectionContentProps) {
  if (!aiEdit) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
        Chat ist für diese Vorlage nicht verfügbar.
      </div>
    );
  }
  return (
    <CanvasChatInner
      aiEdit={aiEdit}
      canvasType={canvasType}
      getSharepicText={getSharepicText}
      captureCanvasImage={captureCanvasImage ?? null}
      specEdit={specEdit ?? null}
    />
  );
}

interface InnerProps {
  aiEdit: CanvasAiEditBridge;
  canvasType: string;
  getSharepicText: () => string;
  captureCanvasImage: (() => Promise<string | null>) | null;
  specEdit: CanvasSpecEditBridge | null;
}

function CanvasChatInner({
  aiEdit,
  canvasType,
  getSharepicText,
  captureCanvasImage,
  specEdit,
}: InnerProps) {
  const chatDoc = useCanvasChatDoc();
  // Template flow (/studio/templates/:type) has no document — a synthetic key
  // still routes the editor_operations payload back to this editor session.
  const draftId = useId();
  const docKey = chatDoc?.documentId ?? `sharepic-draft-${draftId}`;
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  const canvasStore = useCanvasStore();

  const [applyError, setApplyError] = useState<string | null>(null);
  const [checkHint, setCheckHint] = useState<string | null>(null);
  const editSeq = useRef(0);

  // Refs so the memoized adapter's handlers always see live values.
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;
  const getTextRef = useRef(getSharepicText);
  getTextRef.current = getSharepicText;
  const setPendingRef = useRef(setPendingAiSuggestion);
  setPendingRef.current = setPendingAiSuggestion;
  const captureRef = useRef(captureCanvasImage);
  captureRef.current = captureCanvasImage;
  const canvasTypeRef = useRef(canvasType);
  canvasTypeRef.current = canvasType;
  const canvasStoreRef = useRef(canvasStore);
  canvasStoreRef.current = canvasStore;
  const specEditRef = useRef(specEdit);
  specEditRef.current = specEdit;
  // The deck spec the last request sent (spec path), and the person's last
  // message — the review checks the revision against it.
  const specSentRef = useRef<{ deck: string; spec: SharepicSpec; pageIds: string[] } | null>(null);
  const lastUserTextRef = useRef('');

  const chatDocId = chatDoc?.documentId ?? null;

  const runSpecEdit = async (
    sharepic: NonNullable<EditorOperationsEvent['sharepic']>,
    summary: string | null
  ) => {
    const bridge = specEditRef.current;
    const sent = specSentRef.current;
    const seq = ++editSeq.current;
    setApplyError(null);
    if (!bridge || !sent) {
      setCheckHint(null);
      setApplyError('Das Sharepic ließ sich nicht neu aufbauen.');
      return;
    }
    setCheckHint('Sharepic wird neu aufgebaut …');
    // The previous suggestion counts as kept, like on the op path.
    setPendingRef.current(null);
    const isStale = () => editSeq.current !== seq;
    try {
      const result = await applySpecEdit({
        deck: sent.deck,
        sent: { spec: sent.spec, pageIds: sent.pageIds },
        sharepic,
        brief: lastUserTextRef.current || summary || 'Sharepic überarbeiten',
        deps: {
          getPages: bridge.getPages,
          compose: composeCreatorSharepic,
          render: renderPreviews,
          review: async ({ spec, brief, previews }) => {
            const image = await contactSheet(previews).catch(() => null);
            if (!image) return null;
            const review = await getContractsClient()
              .sharepicCreator.review({ body: { spec, prompt: brief, image } })
              .catch(() => null);
            if (review?.status !== 200) return null;
            // The check may fix legibility, not rewrite texts the edit left alone.
            return {
              ...review.body,
              patch: reviewPatchForEdit(sent.spec, spec, review.body.patch),
            };
          },
          applyPatch: (spec, patch) => applySharepicPatch(spec, patch).spec,
          replaceDeck: bridge.replaceDeck,
          isStale,
          newPageId: () => crypto.randomUUID(),
        },
      });
      if (isStale()) return;
      if (result.status === 'failed') {
        setCheckHint(null);
        setApplyError('Das Sharepic ließ sich nicht neu aufbauen.');
        return;
      }
      if (result.status !== 'applied') return;
      setPendingRef.current({ title: summary ?? 'KI-Bearbeitung', undo: 'pages' });
      setCheckHint(describeSpecEdit(result));
    } catch (err) {
      console.warn('[CanvasAiEdit] spec edit failed', err);
      if (isStale()) return;
      setCheckHint(null);
      setApplyError('Das Sharepic ließ sich nicht neu aufbauen.');
    }
  };
  const runSpecEditRef = useRef(runSpecEdit);
  runSpecEditRef.current = runSpecEdit;

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'canvas',
      agentId: AGENT_ID,
      targetId: docKey,
      collaboration: false,
      attachments: false,
      // Collab canvases share the docs per-document thread cache key; draft
      // sessions get a one-off thread bound to this mount.
      threadQueryKey: chatDocId
        ? ['docs', chatDocId, 'chat-thread']
        : ['canvas-draft-chat-thread', docKey],
      resolveThreadId: async () => {
        if (chatDocId) {
          const result = await getContractsClient().docs.getChatThread({
            params: { id: chatDocId },
          });
          if (result.status !== 200) {
            throw new ApiError(result.status, `Chat thread lookup failed: ${result.status}`);
          }
          return chatThreadResponseSchema.parse(result.body).threadId;
        }
        const result = await getContractsClient().threads.create({
          body: { agentId: AGENT_ID, title: 'Sharepic-Entwurf', threadType: 'chat' },
        });
        if (result.status !== 201) {
          throw new ApiError(result.status, `Thread creation failed: ${result.status}`);
        }
        return result.body.id;
      },
      getRequestContext: (): ChatRequestContext => {
        const snapshot = aiEditRef.current.getSnapshot();
        const rawSelection = selectedElementIdsOf(canvasStoreRef.current.getState());
        const selectedElementIds = knownSelectionIds(rawSelection, snapshot);
        const bridge = specEditRef.current;
        // A creator page goes the spec path; anything else stays on canvas ops.
        const spec = bridge
          ? specEditContext(bridge.getPages(), bridge.getActivePageId(), rawSelection)
          : null;
        specSentRef.current = spec && {
          deck: spec.deck,
          spec: spec.sharepic.deckSpec,
          pageIds: spec.pageIds,
        };
        return {
          currentCanvas: {
            id: docKey,
            template: canvasTypeRef.current,
            snapshot,
            capabilities: aiEditRef.current.capabilityList,
            text: getTextRef.current(),
            ...(selectedElementIds.length > 0 ? { selectedElementIds } : {}),
            ...(spec && { sharepic: spec.sharepic }),
          },
        };
      },
      getTools: () => ({
        enabledTools: {
          search: true,
          web: true,
          examples: true,
          pressemitteilung_examples: false,
          research: false,
        },
        customEnabledTools: {
          edit_current_canvas: true,
        },
      }),
      // Tool-based edit: the loop's edit_document tool plans the ops
      // server-side (runCanvasSuggest) and streams them as editor_operations;
      // we apply them to the live canvas and raise the Behalten/Verwerfen
      // banner. Replaces the old trigger_doc_edit → /api/canvas/ai-suggest
      // round-trip.
      registerEditHandler: () =>
        useChatConfigStore.getState().registerEditorOpsHandler(docKey, (payload) => {
          if (payload.sharepic && payload.surface === 'canvas' && payload.targetId === docKey) {
            void runSpecEditRef.current(payload.sharepic, payload.summary ?? null);
            return;
          }
          try {
            const outcome = applyCanvasEditorOps(payload, {
              docKey,
              applyOperations: (ops) => aiEditRef.current.applyOperations(ops),
              setPending: (pending) => setPendingRef.current(pending),
            });
            // Another target's or another surface's event — several editor
            // sidebars share the store, so leave this one's state alone.
            if (outcome.status === 'ignored') return;
            if (outcome.status === 'applied' || outcome.status === 'nothing_applied') {
              // The UI shows German per-kind text; the applier's reasons go here.
              for (const f of outcome.failed) console.warn('[CanvasAiEdit]', f.kind, f.reason);
            }
            // Reset on every event we DO handle, so a stale error cannot stand
            // under a later successful edit.
            setApplyError(describeCanvasEditorOpsOutcome(outcome));
            // A newer edit supersedes any check still in flight and its hint.
            const seq = ++editSeq.current;
            setCheckHint(null);
            const capture = captureRef.current;
            if (outcome.status === 'applied' && capture) {
              void checkEditedCanvas({
                capture,
                check: async (image, instruction) => {
                  const res = await getContractsClient().canvas.aiCheck({
                    body: { image, instruction },
                  });
                  if (res.status !== 200) throw new ApiError(res.status, 'Canvas check failed');
                  return res.body;
                },
                waitForFrame: nextPaint,
                isStale: () => editSeq.current !== seq,
                instruction: payload.summary ?? 'KI-Änderung am Sharepic',
              }).then((hint) => {
                if (editSeq.current === seq) setCheckHint(hint);
              });
            }
          } catch (err) {
            setApplyError(err instanceof Error ? err.message : 'Unbekannter Fehler');
          }
        }),
    }),
    [docKey, chatDocId]
  );

  return (
    <EditorAssistantProvider
      adapter={adapter}
      userId={CANVAS_USER_ID}
      userName={null}
      aiEditEnabled
    >
      <CanvasChatSurface
        applyError={applyError}
        checkHint={checkHint}
        lastUserTextRef={lastUserTextRef}
      />
    </EditorAssistantProvider>
  );
}

/**
 * The config-driven editor selects one element (selectedElement); only the
 * layer API fills selectedLayerIds — same rule as useSelectionAwareness.
 */
function selectedElementIdsOf(s: {
  selectedElement: string | null;
  selectedLayerIds: string[];
}): string[] {
  return s.selectedElement ? [s.selectedElement] : [...s.selectedLayerIds];
}

function CanvasChatNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
      {children}
    </div>
  );
}

/**
 * The thread only mounts once the provider reports `ready`. Before that there is
 * no AssistantRuntimeProvider inside the isolated AUI scope — `ThreadPrimitive`
 * reads `s.thread` unguarded and throws "The current scope does not have a
 * 'thread' property", which took the whole canvas editor down while the thread
 * id was still being resolved. Same gate as the docs/sheets/boards sidebars.
 */
function CanvasChatSurface({
  applyError,
  checkHint,
  lastUserTextRef,
}: {
  applyError: string | null;
  checkHint: string | null;
  lastUserTextRef: { current: string };
}) {
  const state = useEditorAssistant();

  if (state.status === 'guest') {
    return (
      <CanvasChatNotice>Bitte melde dich an, um den KI-Assistenten zu nutzen.</CanvasChatNotice>
    );
  }
  if (state.status === 'loading') {
    return <CanvasChatNotice>Chat wird geladen…</CanvasChatNotice>;
  }
  if (state.status === 'error') {
    return (
      <CanvasChatNotice>Chat konnte nicht geladen werden: {state.error.message}</CanvasChatNotice>
    );
  }

  // Below 900px the thread's own composer is hidden and the sheet-styled
  // CanvasMobileComposer takes its place; the welcome forks the same way.
  return (
    <div className="flex h-full min-h-0 flex-col max-canvas-mobile:gap-3">
      <CompactThread
        className="max-canvas-mobile:[&_[data-gom-composer]]:hidden"
        welcome={
          <>
            <div className="max-canvas-mobile:hidden">
              <CompactWelcome
                icon={<Sparkles className="size-6 text-primary" />}
                description="Stelle Fragen zu deinem Sharepic oder beschreibe direkt eine Änderung. Vorschläge erscheinen direkt am Canvas."
                suggestions={QUICK_PROMPTS}
              />
            </div>
            <div className="canvas-mobile:hidden">
              <CanvasMobileSuggestions />
            </div>
          </>
        }
        assistantIcon={<Sparkles className="size-3.5" />}
        composerPlaceholder="Frage stellen oder Änderung beschreiben…"
      />
      <CanvasEditStatusRow error={applyError} hint={checkHint} />
      <CanvasMobileComposer />
      <LastUserText intoRef={lastUserTextRef} />
    </div>
  );
}

/**
 * Mirrors the newest user message into a ref. Mounted only once the thread is
 * ready (s.thread throws before); a string, so streaming costs no re-render.
 */
function LastUserText({ intoRef }: { intoRef: { current: string } }) {
  const text = useAuiState((s) => {
    for (let i = s.thread.messages.length - 1; i >= 0; i--) {
      const message = s.thread.messages[i];
      if (message?.role !== 'user') continue;
      return message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim();
    }
    return '';
  });
  useEffect(() => {
    intoRef.current = text;
  }, [intoRef, text]);
  return null;
}

function CanvasMobileSuggestions() {
  const composerRuntime = useAui().composer;

  return (
    <div className="-mx-3 flex flex-col gap-2">
      {QUICK_PROMPTS.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => {
            composerRuntime.setText(text);
            composerRuntime.send();
          }}
          className="flex h-10 items-center gap-2.5 rounded-xl border-none bg-[var(--editor-tile)] px-3.5 text-left text-sm text-[var(--editor-text)] cursor-pointer"
        >
          <Sparkles className="size-3.5 shrink-0 text-[var(--editor-active-fg)]" />
          <span className="truncate">{text}</span>
        </button>
      ))}
    </div>
  );
}

function CanvasMobileComposer() {
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <ComposerPrimitive.Root className="flex min-h-12 flex-none items-end gap-2 rounded-xl bg-[var(--editor-tile)] py-1.5 pl-4 pr-1.5 canvas-mobile:hidden">
      <ComposerPrimitive.Input
        placeholder="Frage oder Änderung…"
        rows={1}
        className="max-h-[calc((100dvh_-_var(--mobile-keyboard-offset,0px))_*_0.3)] min-w-0 flex-1 resize-none overflow-y-auto border-none bg-transparent py-2 text-sm leading-5 text-[var(--editor-text)] outline-none placeholder:text-[var(--editor-text-muted)]"
      />
      {isRunning ? (
        <ComposerPrimitive.Cancel
          aria-label="Abbrechen"
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border-none bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)] cursor-pointer"
        >
          <Square className="size-3.5" />
        </ComposerPrimitive.Cancel>
      ) : (
        <ComposerPrimitive.Send
          aria-label="Senden"
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border-none bg-primary-600 text-white cursor-pointer transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="size-[18px]" />
        </ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  );
}

/**
 * Only an error row now. The "wird erstellt…" state belonged to the old client
 * POST to /api/canvas/ai-suggest; the ops arrive pre-planned from the loop and
 * apply synchronously, so a progress flag here would never render a frame —
 * the loop's tool card is what shows that work.
 */
function CanvasEditStatusRow({ error, hint }: { error: string | null; hint: string | null }) {
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
  if (hint) {
    return (
      <div
        role="status"
        className="border-t border-border bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800"
      >
        {hint}
      </div>
    );
  }
  return null;
}
