/**
 * The page decides when the editor may preview initial_state (only `?fresh=1`,
 * dropped once synced) and tells the user when the first sync drags on.
 */
import { act, useSyncExternalStore } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

const collab = vi.hoisted(() => ({
  state: {
    ydoc: {} as object | null,
    provider: { connect: vi.fn(() => Promise.resolve()) },
    isSynced: false,
    isConnected: false,
    authError: null as string | null,
  },
  editorProps: [] as Array<{ collaborative?: { previewBeforeSync?: boolean } }>,
  listeners: new Set<() => void>(),
}));

function setSynced(isSynced: boolean) {
  collab.state = { ...collab.state, isSynced, isConnected: isSynced };
  collab.listeners.forEach((listener) => listener());
}

vi.mock('@gruenerator/canvas-editor', () => ({
  commitOpenTextEdit: () => {},
  useCanvasCollaboration: () =>
    useSyncExternalStore(
      (listener) => {
        collab.listeners.add(listener);
        return () => collab.listeners.delete(listener);
      },
      () => collab.state
    ),
  parseInitialPages: () => undefined,
  preloadCanvasTemplate: () => Promise.resolve(),
  MasterCanvasEditor: (props: {
    chromeCenter?: React.ReactNode;
    collaborative?: { previewBeforeSync?: boolean };
  }) => {
    collab.editorProps.push(props);
    return <div>{props.chromeCenter}</div>;
  },
}));
vi.mock('@gruenerator/collab', () => ({
  getAuthErrorMessage: (reason: string) =>
    reason.includes('denied') ? 'Du hast keinen Zugriff mehr auf dieses Dokument.' : null,
  PresenceAvatars: () => null,
  useCollaborators: () => [],
}));
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getContractsClient: () => ({
    canvas: {
      get: () =>
        Promise.resolve({
          status: 200,
          body: {
            id: 'c1',
            title: 'Radwege',
            template_type: 'freeform',
            initial_state: {},
            created_by: 'u1',
          },
        }),
    },
  }),
}));
vi.mock('../../components/common/LoginRequired/withAuthRequired', () => ({
  default: (component: unknown) => component,
}));
const handleUnauthorized = vi.hoisted(() => vi.fn(() => Promise.resolve('logout')));
vi.mock('../../components/utils/apiClient', () => ({ handleUnauthorized }));
vi.mock('../../hooks/useCollaborationConfig', () => ({ useCollaborationConfig: () => ({}) }));
vi.mock('../tours/useTourAutostart', () => ({ useTourAutostart: () => undefined }));
vi.mock('./WebCanvasEditorProvider', () => ({
  WebCanvasEditorProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./components/ShareCanvasDialog', () => ({ ShareCanvasDialog: () => null }));
vi.mock('./components/SaveAsTemplateDialog', () => ({ SaveAsTemplateDialog: () => null }));

import CollabCanvasStudioPage from './CollabCanvasStudioPage';

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/studio/canvas/:id"
        element={
          <>
            <CollabCanvasStudioPage />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { route }
  );
}

const lastPreviewFlag = () => collab.editorProps.at(-1)?.collaborative?.previewBeforeSync;

beforeEach(() => {
  collab.state = { ...collab.state, isSynced: false, isConnected: false, authError: null };
  handleUnauthorized.mockClear();
  handleUnauthorized.mockResolvedValue('logout');
  collab.state.provider.connect.mockClear();
  collab.editorProps = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CollabCanvasStudioPage', () => {
  it('previews a fresh canvas and drops the flag from the URL once synced', async () => {
    renderPage('/studio/canvas/c1?fresh=1&embedded=1');
    await screen.findByText('Radwege');
    expect(lastPreviewFlag()).toBe(true);

    act(() => setSynced(true));
    expect(screen.getByTestId('search').textContent).toBe('?embedded=1');
    expect(lastPreviewFlag()).toBe(false);
  });

  it('does not preview a canvas opened without the flag', async () => {
    renderPage('/studio/canvas/c1');
    await screen.findByText('Radwege');
    expect(lastPreviewFlag()).toBe(false);
  });

  it('says when the first sync drags on and reconnects on request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderPage('/studio/canvas/c1');
    await screen.findByText('Radwege');
    expect(screen.queryByRole('button', { name: 'Erneut verbinden' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getAllByText('Verbindung dauert länger...').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Erneut verbinden' }));
    expect(collab.state.provider.connect).toHaveBeenCalledTimes(1);
  });

  const failAuth = (reason: string) =>
    act(async () => {
      collab.state = { ...collab.state, authError: reason };
      collab.listeners.forEach((listener) => listener());
    });

  it('hands a collab auth failure to the session handler without a message on logout', async () => {
    renderPage('/studio/canvas/c1?embedded=1');
    await screen.findByText('Radwege');
    expect(handleUnauthorized).not.toHaveBeenCalled();

    await failAuth('permission-denied');
    expect(handleUnauthorized).toHaveBeenCalledWith('collab-auth');
    expect(handleUnauthorized).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a rejection when the session is still alive and handles a later failure', async () => {
    handleUnauthorized.mockResolvedValue('retry');
    renderPage('/studio/canvas/c1');
    await screen.findByText('Radwege');

    await failAuth('permission-denied');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Du hast keinen Zugriff mehr auf dieses Dokument.'
    );
    expect(screen.queryByText('Radwege')).toBeNull();

    await failAuth('session expired');
    expect(handleUnauthorized).toHaveBeenCalledTimes(2);
  });
});
