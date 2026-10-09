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
  },
  editorProps: [] as Array<{ collaborative?: { previewBeforeSync?: boolean } }>,
  listeners: new Set<() => void>(),
}));

function setSynced(isSynced: boolean) {
  collab.state = { ...collab.state, isSynced, isConnected: isSynced };
  collab.listeners.forEach((listener) => listener());
}

vi.mock('@gruenerator/canvas-editor', () => ({
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
  collab.state = { ...collab.state, isSynced: false, isConnected: false };
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
});
