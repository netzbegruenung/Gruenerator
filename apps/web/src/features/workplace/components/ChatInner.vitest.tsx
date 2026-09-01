import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const setChatViewMode = vi.fn();
const location = { pathname: '/start' };
const threadsState: {
  mainThreadId: string;
  threadItems: { id: string; remoteId: string | null; title: string | null }[];
} = { mainThreadId: 't1', threadItems: [] };
const auiState = { optional: { thread: { isRunning: false } } };
const voiceState: { status: { type: string } } | null = null;

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => location,
}));

vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: { Root: ({ children }: { children?: React.ReactNode }) => <>{children}</> },
  useAui: () => ({ threads: { getState: () => threadsState }, thread: { source: 'x' } }),
  useAuiState: (selector: (s: typeof auiState) => unknown) => selector(auiState),
  useVoiceState: () => voiceState,
}));

vi.mock('@gruenerator/chat', () => ({
  // Stands in for the real helper (packages/chat/src/lib/threadPath.ts), whose
  // slug lookup reads the adapter's module-level caches. The shape is what
  // matters here: a path that names the thread.
  buildThreadPath: vi.fn((remoteId: string, title: string | null) =>
    title ? `/chat/${title}-${remoteId}` : `/chat/chat-${remoteId}`
  ),
  GrueneratorComposer: () => null,
  useChatRuntimeReady: () => true,
  useAgentStore: Object.assign(() => null, { getState: () => ({ setChatViewMode }) }),
}));

vi.mock('../../../hooks/useFirstName', () => ({ useFirstName: () => 'Test' }));

// Builds its list from the agent registry at import time; irrelevant here.
vi.mock('./workplacePresets', () => ({ WORKPLACE_PRESETS: [] }));

const { NavigateToChatOnSend } = await import('./ChatInner');

describe('NavigateToChatOnSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.pathname = '/start';
    auiState.optional.thread.isRunning = false;
    threadsState.threadItems = [{ id: 't1', remoteId: 'R', title: null }];
  });

  // The regression: assistant-ui awaits the mint in `_runAppend` before
  // `startRun`, so main already carries its remoteId when `isRunning` flips.
  // Navigating to bare /chat told ChatThreadRouting "no thread open" and it
  // parked the runtime on a fresh draft — the message the user had just sent
  // vanished behind an empty page.
  it('navigates to the started thread, not to bare /chat', () => {
    auiState.optional.thread.isRunning = true;
    render(<NavigateToChatOnSend />);

    expect(navigate).toHaveBeenCalledWith('/chat/chat-R');
    expect(navigate).not.toHaveBeenCalledWith('/chat');
    expect(setChatViewMode).toHaveBeenCalledWith('thread');
  });

  it('passes the thread title along once it exists', () => {
    threadsState.threadItems = [{ id: 't1', remoteId: 'R', title: 'Antrag' }];
    auiState.optional.thread.isRunning = true;
    render(<NavigateToChatOnSend />);

    expect(navigate).toHaveBeenCalledWith('/chat/Antrag-R');
  });

  // A voice session bypasses the model adapter, so nothing has minted yet.
  // Main is a draft then, and parking on a draft is a no-op.
  it('falls back to bare /chat while the main thread is still a draft', () => {
    threadsState.threadItems = [{ id: 't1', remoteId: null, title: null }];
    auiState.optional.thread.isRunning = true;
    render(<NavigateToChatOnSend />);

    expect(navigate).toHaveBeenCalledWith('/chat');
  });

  it('only flips the view mode when already on /chat', () => {
    location.pathname = '/chat';
    auiState.optional.thread.isRunning = true;
    render(<NavigateToChatOnSend />);

    expect(navigate).not.toHaveBeenCalled();
    expect(setChatViewMode).toHaveBeenCalledWith('thread');
  });

  it('does nothing while no run is in flight', () => {
    render(<NavigateToChatOnSend />);

    expect(navigate).not.toHaveBeenCalled();
    expect(setChatViewMode).not.toHaveBeenCalled();
  });
});
