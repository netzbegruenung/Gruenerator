import { Button, Input, Label } from '@gruenerator/ui';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { AdminPanel } from '../components/adminUi';

import { ChunkInspectorView } from './ChunkInspectorView';

/**
 * `/admin/chunks` und `/admin/chunks/:documentId?collection=…` (#3123). Ohne
 * Dokument zeigt die Seite das Formular, mit Dokument die gespeicherten Chunks.
 * Der Chat verlinkt direkt auf die zweite Form (`GlobalChatProvider`).
 */
export default function ChunkInspectorSection() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const collection = searchParams.get('collection') ?? '';
  const offsetParam = Number(searchParams.get('offset'));
  const initialOffset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  return (
    <>
      <ChunkLookupForm
        key={`${documentId ?? ''}|${collection}`}
        initialDocumentId={documentId ?? ''}
        initialCollection={collection}
      />
      {documentId &&
        (collection ? (
          <ChunkInspectorView
            documentId={documentId}
            collection={collection}
            initialOffset={initialOffset}
          />
        ) : (
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
            Ohne Sammlung ist nicht bestimmbar, in welcher Sammlung das Dokument liegt.
          </p>
        ))}
    </>
  );
}

function ChunkLookupForm({
  initialDocumentId,
  initialCollection,
}: {
  initialDocumentId: string;
  initialCollection: string;
}) {
  const navigate = useNavigate();
  const [documentId, setDocumentId] = useState(initialDocumentId);
  const [collection, setCollection] = useState(initialCollection);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = documentId.trim();
    const coll = collection.trim();
    if (!id || !coll) return;
    void navigate(`/admin/chunks/${encodeURIComponent(id)}?collection=${encodeURIComponent(coll)}`);
  };

  return (
    <AdminPanel title="Dokument öffnen">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-sm">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <Label htmlFor="chunk-document-id">Dokument-ID</Label>
          <Input
            id="chunk-document-id"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <Label htmlFor="chunk-collection">Sammlung</Label>
          <Input
            id="chunk-collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="z. B. documents"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" disabled={!documentId.trim() || !collection.trim()}>
          Chunks anzeigen
        </Button>
      </form>
    </AdminPanel>
  );
}
