import { useLocation, useNavigate } from 'react-router-dom';

import { type ReaderTarget } from './ResearchDocumentReader';

/** The notebook search's reader and the chat's source links each keep their
 *  own entry, so a notebook page with both mounted opens one reader, not two. */
export type ReaderStateKey = 'researchReader' | 'chatSourceReader';

type ReaderState = (Partial<Record<ReaderStateKey, ReaderTarget>> & { question?: unknown }) | null;

/**
 * The open reader lives in the history entry, so the browser's back (or a
 * swipe on a phone) closes it instead of leaving the page. Other state on the
 * entry is kept — the chat bridge reads `freshConversation` from it — except
 * a pending `question`, which would otherwise be sent a second time.
 */
export function useResearchReader(key: ReaderStateKey = 'researchReader') {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ReaderState;
  const open = (target: ReaderTarget) => {
    const { question: _pending, ...rest } = state ?? {};
    void navigate(location, { state: { ...rest, [key]: target } });
  };
  return { target: state?.[key] ?? null, open, close: () => void navigate(-1) };
}
