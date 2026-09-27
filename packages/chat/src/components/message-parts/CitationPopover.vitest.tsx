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

import { CitationProvider } from '../../context/CitationContext';
import { CitationPanelProvider, useCitationPanel } from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { axe } from '../../test-utils';

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
      // Spiegelt GlobalChatProvider.tsx: der Host hängt `offset` an, damit die
      // Seite den richtigen Ausschnitt statt immer Seite eins öffnet.
      chunkInspectorHref: ({ documentId, collectionId, chunkIndex }) => {
        const offset = Math.floor(chunkIndex / 50) * 50;
        return `/admin/chunks/${documentId}?collection=${collectionId}&offset=${offset}#chunk-${chunkIndex}`;
      },
    });
    const user = userEvent.setup();
    const { container } = render(<CitationBadge citationId={1} citation={citation()} />);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));

    const link = await screen.findByRole('link', { name: 'Chunks ansehen' });
    expect(link).toHaveAttribute(
      'href',
      '/admin/chunks/doc-1?collection=grundsatz-system&offset=0#chunk-4'
    );
    expect(await axe(container)).toHaveNoViolations();
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

/**
 * Was der Badge an das Panel übergibt. Die Fußnavigation („Zitat 2 von 3")
 * steht und fällt damit, dass der Index in die GEFILTERTE Liste zeigt: eine
 * Websuche-Zitation ohne documentId fällt heraus, und ab da laufen Position in
 * `citations` und Position in `panelSources` auseinander. Ohne einen echten
 * `CitationProvider` um den Badge sieht `useCitationContext()` immer die leere
 * Vorgabe — dann prüft kein Test diese Verdrahtung.
 */
function PanelProbe() {
  const { isOpen, sources, activeIndex } = useCitationPanel();
  if (!isOpen) return <p>zu</p>;
  return (
    <>
      <p>{`aktiv: ${activeIndex}`}</p>
      <p>{`quellen: ${sources.map((s) => s.citationId).join(',')}`}</p>
      <p>{`titel: ${sources[activeIndex]?.documentTitle}`}</p>
      <p>{`zitat: ${sources[activeIndex]?.citedText}`}</p>
    </>
  );
}

function renderBadgeInAnswer(citations: Citation[], clicked: Citation) {
  return render(
    <CitationPanelProvider>
      <CitationProvider citations={citations}>
        <CitationBadge citationId={clicked.id} citation={clicked} />
      </CitationProvider>
      <PanelProbe />
    </CitationPanelProvider>
  );
}

describe('CitationBadge — Übergabe an die Quellen-Seitenleiste', () => {
  it('öffnet das Panel auf der angeklickten Quelle', async () => {
    const user = userEvent.setup();
    const zwei = citation({ id: 2, documentId: 'doc-2', title: 'Wahlprogramm', chunkIndex: 7 });
    renderBadgeInAnswer([citation(), zwei, citation({ id: 3, documentId: 'doc-3' })], zwei);

    await user.click(screen.getByRole('button', { name: /Quelle 2/ }));
    await user.click(await screen.findByRole('button', { name: 'Im Dokument lesen' }));

    expect(screen.getByText('quellen: 1,2,3')).toBeInTheDocument();
    expect(screen.getByText('aktiv: 1')).toBeInTheDocument();
    expect(screen.getByText('titel: Wahlprogramm')).toBeInTheDocument();
  });

  it('zählt den Index in der gefilterten Liste, nicht in allen Zitationen', async () => {
    const user = userEvent.setup();
    // [1] ist eine Websuche-Zitation: keine documentId, also nicht öffenbar.
    // Wer hier in `citations` zählte, landete beim Blättern eine Quelle daneben.
    const websuche = citation({ id: 1, documentId: undefined, collectionId: undefined });
    const drei = citation({ id: 3, documentId: 'doc-3', title: 'Fraktionshandbuch' });
    renderBadgeInAnswer([websuche, citation({ id: 2, documentId: 'doc-2' }), drei], drei);

    await user.click(screen.getByRole('button', { name: /Quelle 3/ }));
    await user.click(await screen.findByRole('button', { name: 'Im Dokument lesen' }));

    expect(screen.getByText('quellen: 2,3')).toBeInTheDocument();
    expect(screen.getByText('aktiv: 1')).toBeInTheDocument();
    expect(screen.getByText('titel: Fraktionshandbuch')).toBeInTheDocument();
  });

  it('reicht den zitierten Text mit, den das Panel hervorhebt', async () => {
    const user = userEvent.setup();
    const eins = citation({ citedText: 'nur gemeinsam getragene Regeln sind tragfähig' });
    renderBadgeInAnswer([eins], eins);

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Im Dokument lesen' }));

    expect(
      screen.getByText('zitat: nur gemeinsam getragene Regeln sind tragfähig')
    ).toBeInTheDocument();
  });

  it('öffnet nichts, wenn kein CitationProvider die Geschwister liefert', async () => {
    // Der `Math.max(0, …)`-Boden im Badge kann einen -1-Index nicht in einen
    // gültigen verwandeln; dass daraus keine falsche Quelle wird, hält
    // `open()` selbst fest, indem es eine leere Liste ablehnt.
    const user = userEvent.setup();
    render(
      <CitationPanelProvider>
        <CitationBadge citationId={1} citation={citation()} />
        <PanelProbe />
      </CitationPanelProvider>
    );

    await user.click(screen.getByRole('button', { name: /Quelle 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Im Dokument lesen' }));

    expect(screen.getByText('zu')).toBeInTheDocument();
  });
});
