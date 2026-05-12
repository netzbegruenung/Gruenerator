import {
  AuiProvider,
  AssistantRuntimeProvider,
  useAui,
  useComposerRuntime,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
} from '@assistant-ui/react';
import { GrueneratorComposer, useAgentStore } from '@gruenerator/chat';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface NotebookGlobalChatLauncherProps {
  /** Mention slug as defined in `notebookMentionables` (e.g. 'berlin', 'hamburg', 'bundestag'). */
  mention: string;
}

/**
 * Pre-fill the composer with `@<mention> ` once on mount so the user sees that
 * the notebook context is already attached. They can edit/extend before sending.
 */
function ComposerPrefill({ initialText }: { initialText: string }) {
  const composerRuntime = useComposerRuntime();
  const didSetRef = useRef(false);

  useEffect(() => {
    if (didSetRef.current) return;
    const current = composerRuntime.getState().text;
    // Only seed when the composer is empty — avoid clobbering a user's draft
    // if the launcher remounts.
    if (!current) {
      composerRuntime.setText(initialText);
      didSetRef.current = true;
    }
  }, [composerRuntime, initialText]);

  return null;
}

/**
 * Resets the assistant-ui store so `useLocalRuntime` mounts a standalone runtime
 * inside the notebook page (which already has its own runtime in scope). Same
 * trick as `NotebookAuiReset` in `NotebookChatProvider.tsx`.
 */
function IsolatedAuiReset({ children }: { children: React.ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

export function NotebookGlobalChatLauncher({ mention }: NotebookGlobalChatLauncherProps) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Intercepting adapter: instead of streaming an answer, ship the user's
  // message off to /chat via the global agent-store handoff (`pendingMessage`),
  // then navigate. The `AutoMessageSender` at /chat picks it up and dispatches
  // through the real chat runtime.
  const adapter: ChatModelAdapter = useMemo(
    () => ({
      async *run({ messages }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const text =
          lastUser?.content
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('')
            .trim() ?? '';

        if (text) {
          useAgentStore.getState().setPendingMessage(text);
          void navigateRef.current('/chat');
        }

        // Yield once with empty content so assistant-ui closes out the run
        // cleanly. The user is already navigating away — they won't see this.
        yield { content: [] };
      },
    }),
    []
  );

  const runtime = useLocalRuntime(adapter);
  const initialText = `@${mention} `;

  return (
    <IsolatedAuiReset>
      <AssistantRuntimeProvider runtime={runtime}>
        <ComposerPrefill initialText={initialText} />
        <GrueneratorComposer
          placeholder="Frage stellen oder Aufgabe beschreiben…"
          showMentions
          showPlusMenu={false}
          showToolToggles={false}
          requireProfileHydration
        />
      </AssistantRuntimeProvider>
    </IsolatedAuiReset>
  );
}
