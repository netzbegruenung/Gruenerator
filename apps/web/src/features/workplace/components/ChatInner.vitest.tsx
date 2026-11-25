import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const setChatViewMode = vi.fn();
const location = { pathname: '/start' };
const auiState = { optional: { thread: { isRunning: false } } };
const voiceState: { status: { type: string } } | null = null;

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => location,
}));

vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: { Root: ({ children }: { children?: React.ReactNode }) => <>{children}</> },
  useAui: () => ({ thread: { source: 'x' } }),
  useAuiState: (selector: (s: typeof auiState) => unknown) => selector(auiState),
  useVoiceState: () => voiceState,
}));

vi.mock('@gruenerator/chat', () => ({
  GrueneratorComposer: () => null,
  useChatRuntimeReady: () => true,
  useAgentStore: Object.assign(() => null, { getState: () => ({ setChatViewMode }) }),
}));

vi.mock('../../../hooks/useFirstName', () => ({ useFirstName: () => 'Test' }));

const { NavigateToChatOnSend } = await import('./ChatInner');

describe('NavigateToChatOnSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.pathname = '/start';
    auiState.optional.thread.isRunning = false;
  });

  // The regression: it used to address the thread itself from main's remoteId.
  // assistant-ui reports a minted id a commit after initialize() resolves, so
  // main still looked like a draft, the hop went to bare /chat, and the router
  // parked there on a fresh draft — the message the user had just sent
  // vanished. ChatThreadRouting claims the URL for the handed-over thread.
  it('hands the running thread over to /chat', () => {
    auiState.optional.thread.isRunning = true;
    render(<NavigateToChatOnSend />);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/chat', { state: { adoptOpenThread: true } });
    expect(setChatViewMode).toHaveBeenCalledWith('thread');
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
