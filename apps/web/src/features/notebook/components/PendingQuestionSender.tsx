import { useComposerRuntime } from '@assistant-ui/react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Consumes a `question` handed over via router state (omni composer →
 * `navigate(path, { state: { question } })`) and submits it through the
 * notebook chat runtime once it is mounted. The state is cleared afterwards
 * so back-navigation or a reload doesn't re-send the question.
 *
 * Must be mounted inside `NotebookChatProvider` (needs the composer runtime).
 * Delay mirrors `AutoMessageSender` — the runtime needs a beat after mount.
 */
export function PendingQuestionSender() {
  const location = useLocation();
  const navigate = useNavigate();
  const composerRuntime = useComposerRuntime();
  const sentRef = useRef(false);
  const question = (location.state as { question?: string } | null)?.question;

  useEffect(() => {
    if (!question || sentRef.current) return;

    // Guard inside the timer, not before scheduling: a dependency identity
    // change (e.g. a fresh composerRuntime after a provider re-render) within
    // the 400ms window runs cleanup and re-runs the effect. Setting sentRef
    // up-front would make that re-run bail here and drop the question forever;
    // instead we reschedule and let the in-timer guard prevent a double send.
    const timer = setTimeout(() => {
      if (sentRef.current) return;
      sentRef.current = true;
      try {
        composerRuntime.setText(question);
        composerRuntime.send();
      } catch (err) {
        console.warn('[PendingQuestionSender] Failed to send question:', err);
      }
      void navigate(location.pathname, { replace: true, state: null });
    }, 400);

    return () => clearTimeout(timer);
  }, [question, composerRuntime, navigate, location.pathname]);

  return null;
}
