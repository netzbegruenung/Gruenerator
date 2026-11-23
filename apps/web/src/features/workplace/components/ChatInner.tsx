import { ThreadPrimitive, useAui, useAuiState, useVoiceState } from '@assistant-ui/react';
import {
  GrueneratorComposer,
  hasPendingHandoff,
  useAgentStore,
  useChatRuntimeReady,
} from '@gruenerator/chat';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useFirstName } from '../../../hooks/useFirstName';
import { ADOPT_OPEN_THREAD_STATE } from '../../chat/adoptOpenThread';

import { WORKPLACE_PRESETS } from './workplacePresets';

import { cn } from '@/utils/cn';

export function NavigateToChatOnSend() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRunning = useAuiState((s) => s.optional.thread?.isRunning ?? false);
  const voiceState = useVoiceState();
  const hasNavigated = useRef(false);
  // On /chat itself the view-mode flip suffices (ChatPage renders the thread
  // and ChatThreadRouting upgrades the URL); navigating again would push a
  // duplicate history entry.
  const onChat = location.pathname.startsWith('/chat');

  const goToThread = useCallback(() => {
    useAgentStore.getState().setChatViewMode('thread');
    if (onChat) return;
    // Hand the running thread to /chat; ChatThreadRouting addresses it. This
    // side cannot: assistant-ui reports a freshly minted remoteId a commit
    // after initialize() resolves, so when `isRunning` flips main often still
    // looks like a draft. Navigating to bare /chat on that reading let the
    // router park on a fresh draft once the id did arrive — the message the
    // user had just sent vanished behind an empty page. The same state covers
    // a voice session, whose transcripts bypass the model adapter.
    void navigate('/chat', { state: ADOPT_OPEN_THREAD_STATE });
  }, [navigate, onChat]);

  // Voice sessions don't flip `threadRuntime.isRunning` because transcripts
  // bypass the model adapter. Without this hop, voice messages would be
  // appended to the runtime but never displayed (workplace has no Thread).
  const voiceActive =
    voiceState?.status.type === 'starting' || voiceState?.status.type === 'running';
  useEffect(() => {
    if (voiceActive && !hasNavigated.current) {
      hasNavigated.current = true;
      goToThread();
    }
  }, [voiceActive, goToThread]);

  useEffect(() => {
    if (isRunning && !hasNavigated.current) {
      hasNavigated.current = true;
      goToThread();
    }
    if (!isRunning && !voiceActive) {
      hasNavigated.current = false;
    }
  }, [isRunning, voiceActive, goToThread]);

  return null;
}

// Eine Projektseite kann lange offen stehen, bevor jemand schreibt.
const PROJECT_PICK_TTL_MS = 60 * 60_000;

interface ChatInnerProps {
  /** TRIAL: fill the parent instead of the 720 px chat column (Arbeiten hero). */
  wide?: boolean;
  /** 'pill' (default): one slim row. 'card': text field above its toolbar, the
   * two-line composer of the chat page (phones, where the row gets cramped). */
  variant?: 'card' | 'pill';
  /**
   * Projekt-Übersicht: der neue Chat entsteht in diesem Projekt (`pendingGroup`).
   * Fehlt = Start-Composer ohne Projekt.
   */
  projectId?: string;
  /** Der Chat wird mit dem Team geteilt (nur mit `projectId`). */
  teamShared?: boolean;
}

const ChatInnerReady: React.FC<ChatInnerProps> = ({
  projectId,
  teamShared = false,
  wide = false,
  variant = 'pill',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const firstName = useFirstName();
  const aui = useAui();
  const threadAvailable = aui.thread.source != null;
  const onChat = location.pathname.startsWith('/chat');

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  // The workplace composer is a "new chat" entry point — reset any agent/skill
  // context carried over from a previous session AND start a fresh thread so a
  // message sent from here never continues the last active chat. The runtime is
  // hoisted to the app root, so without switchToNewThread the composer stays
  // bound to the persisted currentThreadId (mirrors the /chat overview).
  useEffect(() => {
    const hasPending = hasPendingHandoff(useAgentStore.getState());
    // On /chat the URL owns which thread is active — bare /chat means "draft",
    // and ChatThreadRouting establishes it. Switching from this mount effect too
    // cancelled whatever switch was in flight (assistant-ui's switches are
    // last-call-wins), and the hero remounts on every Back out of a thread, so a
    // quick click could land back here instead of on the thread. The only piece
    // still ours is the hand-off of queued content: AutoMessageSender lives in
    // the thread view, so flip to it. ChatPage already resets the agent context
    // for a bare /chat.
    if (onChat) {
      if (hasPending) useAgentStore.getState().setChatViewMode('thread');
      return;
    }
    // A pending message means another surface queued content for /chat; don't
    // clobber it by switching threads — that surface navigates to /chat itself.
    if (hasPending) return;
    useAgentStore.getState().resetChatContext();
    void aui.threads.switchToNewThread();
  }, [aui, onChat]);

  // Projekt vorwählen, und beim Verlassen ohne Senden wieder abräumen: sonst
  // stünde das Projekt im nächsten Start-Composer noch gewählt. Nach dem Senden
  // ist der Thread nicht mehr leer, und die Thread-Anlage hat die Wahl schon
  // verbraucht (`GrueneratorThreadListAdapter`).
  const threadEmptyRef = useRef(true);
  threadEmptyRef.current = useAuiState((s) => s.optional.thread?.isEmpty ?? true);
  useEffect(() => {
    if (!projectId) return;
    useAgentStore.getState().setPendingGroup(projectId, teamShared, PROJECT_PICK_TTL_MS);
  }, [projectId, teamShared]);
  useEffect(() => {
    if (!projectId) return;
    return () => {
      const store = useAgentStore.getState();
      if (threadEmptyRef.current && store.pendingGroup?.id === projectId) {
        store.setPendingGroup(null);
      }
    };
  }, [projectId]);

  if (!threadAvailable) return null;

  return (
    <ThreadPrimitive.Root
      className={cn(
        // Auf der Projektseite bündig mit Kopf, Tabs und Chat-Liste, auf der Startseite zentriert.
        // Auf der Projektseite schließt der Composer bündig mit der Spalte ab:
        // ohne den Fußabstand und den seitlichen Rand des Chat-Bildschirms.
        projectId
          ? 'w-full shrink-0 [&>div]:pb-0! [&_form.composer-root]:mx-0 [&_form.composer-root]:max-w-none'
          : wide
            ? 'w-full shrink-0 [&_form.composer-root]:max-w-none'
            : 'w-full shrink-0 mx-auto max-w-[720px]',
        '[&>div]:px-0',
        // The hero shows the mode-toggle link instead of the disclaimer.
        '[&>div>p.text-center]:hidden'
      )}
    >
      <NavigateToChatOnSend />
      <GrueneratorComposer
        variant={variant}
        onNavigate={handleNavigate}
        firstName={firstName}
        presets={WORKPLACE_PRESETS}
        requireProfileHydration
        enablePastedTextAttachments
      />
    </ThreadPrimitive.Root>
  );
};

// While the lazy assistant-ui runtime chunk loads, GrueneratorChatProvider's
// Suspense fallback renders the page WITHOUT AssistantRuntimeProvider — calling
// useAui()/useVoiceState() there crashes with "requires an
// AuiProvider". Gate on runtime readiness (same guard as ChatPage/SearchPage)
// and reserve the composer's footprint so the hero doesn't jump.
const ChatInner: React.FC<ChatInnerProps> = memo((props) => {
  const runtimeReady = useChatRuntimeReady();
  if (!runtimeReady) {
    return (
      <div
        className={cn('w-full shrink-0 min-h-24', !props.projectId && 'mx-auto max-w-[720px]')}
        aria-hidden
      />
    );
  }
  return <ChatInnerReady {...props} />;
});

ChatInner.displayName = 'ChatInner';

export default ChatInner;
