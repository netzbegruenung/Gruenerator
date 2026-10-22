import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const platformFetch = vi.fn();
vi.mock('../../utils/platformFetch', () => ({
  platformFetch: (...args: unknown[]) => platformFetch(...args) as unknown,
}));
vi.mock('./docsAdapter', () => ({ webAppDocsAdapter: { getApiBaseUrl: () => '/api' } }));
vi.mock('./DocsEditorPage', () => ({ default: () => <div>blocknote-editor</div> }));

import CollabDocRoute from './CollabDocRoute';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/office/:id" element={<CollabDocRoute />} />
          <Route path="/studio/canvas/:id" element={<div>canvas-editor</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CollabDocRoute', () => {
  it('sends canvas decks to the canvas editor', async () => {
    platformFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'deck-1', document_subtype: 'canvas' }), { status: 200 })
    );
    renderAt('/office/deck-1');
    expect(await screen.findByText('canvas-editor')).toBeTruthy();
    expect(screen.queryByText('blocknote-editor')).toBeNull();
  });

  it('keeps text documents in BlockNote', async () => {
    platformFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'doc-1', document_subtype: 'blank' }), { status: 200 })
    );
    renderAt('/office/doc-1');
    expect(await screen.findByText('blocknote-editor')).toBeTruthy();
  });
});
