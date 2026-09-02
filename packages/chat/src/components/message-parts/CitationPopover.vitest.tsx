/**
 * Der Einstieg in den Chunk-Inspektor darf nur erscheinen, wenn die Host-App ihn
 * anbietet — packages/chat kennt weder die Route noch die Admin-Rolle. Und er
 * darf nicht erscheinen, wenn der Zitation die Felder fehlen: documentId,
 * collectionId und chunkIndex sind in `chatCitationBase`
 * (packages/contracts/src/schemas/chatStreamEvents.ts) optionale Felder, die nur
 * bei Notebook-/Dokument-Zitationen gesetzt sind — bei einer Websuche fehlen sie.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { CitationBadge } from './CitationPopover';

import type { Citation } from '../../hooks/useChatGraphStream';

function citation(over: Record<string, unknown> = {}): Citation {
  return {
    id: 1,
    title: 'Grundsatzprogramm',
    url: 'https://gruene.de/grundsatz',
    snippet: '',
    // getCollectionStyle(citation.source) (CitationPopover.tsx:39, pre-existing,
    // untouched by this task) throws on undefined — a real source is required
    // for the badge to render at all.
    source: 'grundsatz-system',
    documentId: 'doc-1',
    collectionId: 'grundsatz-system',
    chunkIndex: 4,
    ...over,
  } as Citation;
}

afterEach(() => {
  useChatConfigStore.getState().configure();
});

describe('CitationBadge — Einstieg in den Chunk-Inspektor', () => {
  it('zeigt den Eintrag, wenn die Host-App einen Link liefert', async () => {
    useChatConfigStore.getState().configure({
      chunkInspectorHref: ({ documentId, collectionId, chunkIndex }) =>
        `/admin/chunks/${documentId}?collection=${collectionId}#chunk-${chunkIndex}`,
    });
    const user = userEvent.setup();
    render(<CitationBadge citationId={1} citation={citation()} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    const link = await screen.findByRole('link', { name: 'Chunks ansehen' });
    expect(link).toHaveAttribute('href', '/admin/chunks/doc-1?collection=grundsatz-system#chunk-4');
  });

  it('blendet den Eintrag aus, wenn die Host-App null liefert (kein Admin)', async () => {
    useChatConfigStore.getState().configure({ chunkInspectorHref: () => null });
    const user = userEvent.setup();
    render(<CitationBadge citationId={1} citation={citation()} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    await screen.findByRole('button', { name: 'Im Dokument lesen' });
    expect(screen.queryByRole('link', { name: 'Chunks ansehen' })).not.toBeInTheDocument();
  });

  it('blendet den Eintrag aus, wenn die Zitation die Felder nicht trägt', async () => {
    useChatConfigStore.getState().configure({ chunkInspectorHref: () => '/admin/chunks/x' });
    const user = userEvent.setup();
    render(<CitationBadge citationId={1} citation={citation({ collectionId: undefined })} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    expect(screen.queryByRole('link', { name: 'Chunks ansehen' })).not.toBeInTheDocument();
  });

  it('blendet den Eintrag aus, wenn die Zitation keine documentId trägt', async () => {
    useChatConfigStore.getState().configure({ chunkInspectorHref: () => '/admin/chunks/x' });
    const user = userEvent.setup();
    render(<CitationBadge citationId={1} citation={citation({ documentId: undefined })} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    expect(screen.queryByRole('link', { name: 'Chunks ansehen' })).not.toBeInTheDocument();
  });

  it('blendet den Eintrag aus, wenn die Zitation keinen chunkIndex trägt', async () => {
    useChatConfigStore.getState().configure({ chunkInspectorHref: () => '/admin/chunks/x' });
    const user = userEvent.setup();
    render(<CitationBadge citationId={1} citation={citation({ chunkIndex: undefined })} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    expect(screen.queryByRole('link', { name: 'Chunks ansehen' })).not.toBeInTheDocument();
  });
});
