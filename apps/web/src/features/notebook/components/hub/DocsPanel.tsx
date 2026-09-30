import {
  NOTEBOOK_MAX_DOCUMENTS,
  type LinkedDocRef,
  type NotebookDocumentRecord,
} from '@gruenerator/contracts';
import { useDocsAdapter, useDocuments } from '@gruenerator/docs';
import { Button, Input, toast } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { HiDocumentText } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { useDocumentsStore } from '../../../../stores/documentsStore';
import { DocumentCard } from '../../../docs/DocumentCard';
import { syncLinkedDoc } from '../../hooks/syncLinkedDoc';

import { EmptySources, filterByTitle, NoMatches, SearchRow } from './PanelChrome';
import { SourceTable } from './SourceTable';

import type { NotebookHubApi } from './useNotebookHub';

const PAGE = 24;

interface DocsPanelProps {
  hub: NotebookHubApi;
  rows: NotebookDocumentRecord[];
  linkedDocs: LinkedDocRef[];
  total: number;
  onPreview: (doc: NotebookDocumentRecord) => void;
}

/**
 * Grünerator-Dokumente als Quelle. Übernommen wird ein Schnappschuss (der
 * Markdown-Export, als Datei hochgeladen); „Aktualisieren" holt den aktuellen
 * Stand und ersetzt die alte Fassung. Automatisch nachgezogen wird nichts.
 */
export function DocsPanel({ hub, rows, linkedDocs, total, onPreview }: DocsPanelProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  const refByDocument = useMemo(
    () => new Map(linkedDocs.flatMap((r) => (r.documentId ? [[r.documentId, r] as const] : []))),
    [linkedDocs]
  );

  const importRefs = async (refs: LinkedDocRef[]) => {
    const ctx = { documentsStore: useDocumentsStore.getState() };
    const updated: LinkedDocRef[] = [];
    const replaced: string[] = [];
    for (const ref of refs) {
      const result = await syncLinkedDoc(ref, ctx);
      if (result.kind === 'updated') {
        updated.push(result.newRef);
        if (result.oldDocumentId) replaced.push(result.oldDocumentId);
      } else if (result.kind === 'vanished') {
        toast.error(`„${ref.docTitle}" gibt es nicht mehr oder du hast keinen Zugriff.`);
      } else {
        toast.error(`„${ref.docTitle}": ${result.message}`);
      }
    }
    await hub.addDocuments(
      updated.flatMap((r) => (r.documentId ? [r.documentId] : [])),
      updated
    );
    if (replaced.length > 0) await hub.removeDocuments(replaced);
    return updated.length;
  };

  const remove = async (ids: string[]) => {
    const drop = new Set(ids);
    await hub.removeDocuments(ids);
    await hub.saveMeta({
      linked_docs: linkedDocs.filter((r) => !(r.documentId && drop.has(r.documentId))),
    });
  };

  if (picking) {
    return (
      <DocsPicker
        linkedDocs={linkedDocs}
        room={Math.max(0, NOTEBOOK_MAX_DOCUMENTS - total)}
        onCancel={() => setPicking(false)}
        onConfirm={async (refs) => {
          const added = await importRefs(refs);
          if (added > 0) setPicking(false);
        }}
      />
    );
  }

  const visible = filterByTitle(rows, query);
  const guard = (fn: () => Promise<unknown>) =>
    void fn().catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.')
    );

  return (
    <section aria-label="Verknüpfte Dokumente" className="flex flex-col gap-sm">
      {rows.length > 0 ? (
        <>
          <SearchRow
            query={query}
            onQuery={setQuery}
            placeholder="Docs durchsuchen…"
            action={
              <Button variant="brand" size="brand-sm" onClick={() => setPicking(true)}>
                + <span className="max-sm:sr-only">Dokumente</span>
              </Button>
            }
          />
          <p className="m-0 text-[13px] text-pretty text-grey-500">
            Verknüpfte Grünerator-Dokumente. Spätere Änderungen übernimmst du mit „Aktualisieren“.
          </p>
        </>
      ) : null}

      {rows.length === 0 ? (
        <EmptySources
          icon={<HiDocumentText aria-hidden className="size-5" />}
          title="Noch keine Dokumente"
          text="Füge Grünerator-Dokumente hinzu, z. B. Anträge, Pressemitteilungen oder Protokolle."
          cta="Dokumente wählen"
          onCta={() => setPicking(true)}
        />
      ) : visible.length === 0 ? (
        <NoMatches query={query} />
      ) : (
        <SourceTable
          rows={visible}
          readyLabel="Verknüpft"
          onPreview={onPreview}
          actions={[
            {
              label: 'Im Editor öffnen',
              when: (doc) => refByDocument.has(doc.id),
              onSelect: (doc) => void navigate(`/docs/${refByDocument.get(doc.id)!.docId}`),
            },
            {
              label: 'Aktualisieren',
              when: (doc) => refByDocument.has(doc.id),
              onSelect: (doc) => guard(() => importRefs([refByDocument.get(doc.id)!])),
            },
          ]}
          onRemove={remove}
        />
      )}
    </section>
  );
}

function DocsPicker({
  linkedDocs,
  room,
  onCancel,
  onConfirm,
}: {
  linkedDocs: LinkedDocRef[];
  room: number;
  onCancel: () => void;
  onConfirm: (refs: LinkedDocRef[]) => Promise<void>;
}) {
  const docsQuery = useDocuments();
  const adapter = useDocsAdapter();
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);

  const attached = useMemo(() => new Set(linkedDocs.map((d) => d.docId)), [linkedDocs]);
  const docs = filterByTitle(docsQuery.data ?? [], query);

  const toggle = (id: string) =>
    setPicks((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= room) {
        toast.error('Das Notebook ist voll.');
        return prev;
      }
      return [...prev, id];
    });

  const confirm = async () => {
    const byId = new Map((docsQuery.data ?? []).map((d) => [d.id, d]));
    const refs = picks.flatMap((id) => {
      const doc = byId.get(id);
      return doc
        ? [{ docId: doc.id, docTitle: doc.title, documentId: null, lastSyncedAt: null }]
        : [];
    });
    setBusy(true);
    try {
      await onConfirm(refs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Dokumente hinzufügen"
      className="flex flex-col gap-md rounded-xl border border-grey-200 p-[clamp(1rem,3vw,1.5rem)] dark:border-grey-700"
    >
      <div className="flex items-start justify-between gap-sm">
        <div className="flex flex-col gap-1">
          <strong className="text-lg">Dokumente hinzufügen</strong>
          <span className="text-sm text-pretty text-grey-500">
            Wähle Grünerator-Dokumente. Übernommen wird ihr aktueller Stand.
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
      </div>
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShown(PAGE);
        }}
        placeholder="Meine Dokumente durchsuchen…"
        aria-label="Meine Dokumente durchsuchen"
      />
      {docsQuery.isPending ? (
        <p className="m-0 text-sm text-grey-500">Dokumente werden geladen…</p>
      ) : docs.length === 0 ? (
        <p className="m-0 text-sm text-grey-500">
          {query ? 'Keine Treffer für deine Suche.' : 'Du hast noch keine Dokumente.'}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-sm">
          {docs.slice(0, shown).map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              adapter={adapter}
              mode="select"
              isSelected={picks.includes(doc.id) || attached.has(doc.id)}
              isDisabled={busy || attached.has(doc.id)}
              onSelect={toggle}
            />
          ))}
        </div>
      )}
      {docs.length > shown ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => setShown((n) => n + PAGE)}
        >
          Mehr anzeigen
        </Button>
      ) : null}
      <div className="sticky bottom-0 flex items-center justify-between gap-sm border-t border-grey-200 bg-background pt-sm dark:border-grey-700">
        <span className="text-sm text-grey-500">
          {picks.length ? `${picks.length} ausgewählt` : 'Keine Auswahl'}
        </span>
        <Button
          variant="brand"
          size="brand-sm"
          onClick={() => void confirm()}
          disabled={busy || picks.length === 0}
        >
          {busy
            ? 'Wird übernommen…'
            : picks.length > 1
              ? `${picks.length} Dokumente hinzufügen`
              : 'Dokument hinzufügen'}
        </Button>
      </div>
    </section>
  );
}
