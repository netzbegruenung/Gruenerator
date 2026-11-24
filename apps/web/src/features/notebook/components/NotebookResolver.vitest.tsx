import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test-utils';

vi.mock('../../../components/common/LoginRequired/withAuthRequired', () => ({
  default: <P,>(Component: P) => Component,
}));
// The page itself is out of scope — what it is handed is the question here.
vi.mock('./NotebookPage', () => ({
  DynamicNotebookPage: ({ id }: { id: string }) => <p>page:{id}</p>,
  NotebookPageContent: () => <p>system</p>,
}));

vi.mock('./NotebookTabs', () => ({ NotebookTabs: () => null }));
const recordUsage = vi.fn<(type: string, id: string | null) => void>();
vi.mock('../../usage/useItemUsage', () => ({
  useRecordItemUsage: (type: string, id: string | null) => {
    recordUsage(type, id);
  },
}));

const { NotebookResolver } = await import('./NotebookResolver');

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/notebooks/:idOrSlug" element={<NotebookResolver />} />
    </Routes>,
    { route }
  );

describe('NotebookResolver', () => {
  // MSW fails any unhandled request, so a resolve round trip would break these.
  it('hands a pretty slug straight to the page, without resolving it first', () => {
    renderAt('/notebooks/presseschau-Ab3xK9');

    expect(screen.getByText('page:presseschau-Ab3xK9')).toBeInTheDocument();
  });

  it('hands a UUID straight to the page', () => {
    renderAt('/notebooks/11111111-2222-3333-4444-555555555555');

    expect(screen.getByText('page:11111111-2222-3333-4444-555555555555')).toBeInTheDocument();
  });

  // „Zuletzt" auf /projekte findet ein System-Notebook nur unter der Id, mit der
  // auch der Chat es verbucht — nicht unter dem Slug oder der Sammlung.
  it('records opening a system notebook under its registry id', () => {
    recordUsage.mockClear();
    renderAt('/notebooks/bayern');

    expect(screen.getByText('system')).toBeInTheDocument();
    expect(recordUsage).toHaveBeenCalledWith('notebook', 'bayern-notebook');
  });

  it('leaves recording a user notebook to the page, which knows its UUID', () => {
    recordUsage.mockClear();
    renderAt('/notebooks/presseschau-Ab3xK9');

    expect(recordUsage).not.toHaveBeenCalledWith('notebook', expect.any(String));
  });

  it('calls a segment without a slug tail unknown', () => {
    renderAt('/notebooks/gibtsnicht');

    expect(screen.getByText('Notebook "gibtsnicht" nicht gefunden.')).toBeInTheDocument();
  });
});
