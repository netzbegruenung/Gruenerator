import { type InspectedChunk, type InspectedDocumentHeader } from '@gruenerator/contracts';
import {
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';
import { useState } from 'react';

import { CHUNK_PAGE_SIZE, useChunkSearch, useDocumentChunks } from '../hooks/useChunkInspector';

const NOT_STORED = 'nicht gespeichert';

function HeaderField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-3xs">
      <dt className="text-xs uppercase tracking-wide text-grey-500 dark:text-grey-400">{label}</dt>
      <dd
        className={
          value === null
            ? 'text-sm italic text-grey-500 dark:text-grey-400'
            : 'text-sm text-foreground'
        }
      >
        {value ?? NOT_STORED}
      </dd>
    </div>
  );
}

function DocumentHeader({ header }: { header: InspectedDocumentHeader }) {
  return (
    <dl className="grid grid-cols-2 gap-md md:grid-cols-4 mb-lg">
      <HeaderField label="Titel" value={header.title} />
      <HeaderField label="Datei" value={header.filename} />
      <HeaderField label="Extraktionsverfahren" value={header.extractionMethod} />
      <HeaderField
        label="Herkunft der Angabe"
        value={
          header.extractionMethodOrigin === 'postgres_metadata'
            ? 'documents.metadata'
            : header.extractionMethodOrigin === 'qdrant_payload'
              ? 'Qdrant-Nutzlast'
              : null
        }
      />
      <HeaderField
        label="Seiten"
        value={header.pageCount === null ? null : String(header.pageCount)}
      />
      <HeaderField label="Chunks" value={String(header.chunkCount)} />
      <HeaderField label="Qdrant-Sammlung" value={header.qdrantCollection} />
      <HeaderField
        label="Zuletzt geändert / erstellt"
        value={
          header.indexedAt === null ? null : new Date(header.indexedAt).toLocaleString('de-DE')
        }
      />
      <HeaderField label="Titel-Präfix beim Einbetten" value={header.embeddingTitlePrefix} />
      <HeaderField
        label="Abrufschwelle"
        value={header.qualityThreshold === null ? null : header.qualityThreshold.toFixed(2)}
      />
    </dl>
  );
}

function ChunkRow({
  chunk,
  qualityThreshold,
  hitSimilarity,
}: {
  chunk: InspectedChunk;
  qualityThreshold: number | null;
  hitSimilarity: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const belowThreshold =
    chunk.qualityScore !== null &&
    qualityThreshold !== null &&
    chunk.qualityScore < qualityThreshold;

  return (
    <>
      <TableRow
        id={`chunk-${chunk.index}`}
        className={hitSimilarity === null ? undefined : 'bg-primary-50 dark:bg-primary-950'}
      >
        <TableCell>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-sm underline-offset-2 hover:underline"
          >
            #{chunk.index}
          </button>
        </TableCell>
        <TableCell>{chunk.page === null ? NOT_STORED : chunk.page}</TableCell>
        <TableCell>{chunk.charCount}</TableCell>
        <TableCell>
          {chunk.qualityScore === null ? (
            <span className="italic text-grey-500 dark:text-grey-400">{NOT_STORED}</span>
          ) : (
            <span>
              {chunk.qualityScore.toFixed(2)}
              {belowThreshold && (
                <span className="ml-2xs text-xs text-red-600 dark:text-red-400">
                  unter Abrufschwelle — nie abrufbar
                </span>
              )}
            </span>
          )}
        </TableCell>
        <TableCell>{chunk.hasTable ? 'ja' : 'nein'}</TableCell>
        <TableCell>
          {chunk.embeddingPresent ? 'dicht' : '—'}
          {chunk.sparsePresent ? ' + BM25' : ''}
        </TableCell>
        <TableCell>
          {hitSimilarity === null ? (
            <span className="text-grey-400">—</span>
          ) : (
            <span className="font-medium">
              Treffer · {hitSimilarity.toFixed(2).replace('.', ',')}
            </span>
          )}
        </TableCell>
        <TableCell className="max-w-md truncate">{chunk.text.slice(0, 300)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8}>
            <pre className="whitespace-pre-wrap break-words text-sm">{chunk.text}</pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function ChunkInspectorView({
  documentId,
  collection,
  initialOffset = 0,
}: {
  documentId: string;
  collection: string;
  /** Seed für die Seite, z.B. aus dem `offset`-Query-Parameter der Route. */
  initialOffset?: number;
}) {
  const [offset, setOffset] = useState(initialOffset);
  const [draftQuery, setDraftQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const search = useChunkSearch(documentId, collection, submittedQuery);
  const hitByIndex = new Map(
    (search.data?.hits ?? []).map((hit) => [hit.index, hit.similarity] as const)
  );
  const { data, isLoading, isError, error } = useDocumentChunks(documentId, collection, offset);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="py-lg text-center text-sm text-grey-500 dark:text-grey-400">
        {error?.message ?? 'Die Chunks konnten nicht geladen werden.'}
      </p>
    );
  }

  const markedHitCount = data.chunks.filter((chunk) => hitByIndex.has(chunk.index)).length;
  const hasHitsOutsidePage = (search.data?.hits.length ?? 0) > markedHitCount;

  return (
    <div className="flex flex-col gap-lg">
      <DocumentHeader header={data.header} />

      <form
        className="flex flex-col gap-2xs"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(draftQuery.trim());
        }}
      >
        <label htmlFor="chunk-search" className="text-sm font-medium text-foreground">
          Suche in diesem Dokument
        </label>
        <input
          id="chunk-search"
          type="search"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Frage stellen, wie im Chat"
          className="rounded-md border border-grey-300 px-sm py-2xs text-sm dark:border-grey-700 dark:bg-grey-900"
        />
        <div className="text-sm text-grey-500 dark:text-grey-400" aria-live="polite">
          {search.data && (
            <>
              <p className="m-0">
                {search.data.scoped
                  ? 'Suche auf dieses Dokument eingeschränkt'
                  : 'Suche über die ganze Sammlung; Treffer dieses Dokuments markiert'}
              </p>
              <p className="m-0">
                {search.data.hits.length} von {search.data.totalResults} Treffern stammen aus diesem
                Dokument.
                {hasHitsOutsidePage && ' — weitere Treffer ggf. auf anderen Seiten'}
              </p>
            </>
          )}
          {search.isError && (
            <p className="m-0 text-sm text-red-600 dark:text-red-400">
              {search.error?.message ?? 'Die Suche ist fehlgeschlagen.'}
            </p>
          )}
        </div>
      </form>

      {data.chunks.length === 0 ? (
        <p className="py-lg text-center text-sm text-grey-500 dark:text-grey-400">
          Zu diesem Dokument liegen keine Chunks vor.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-grey-200 dark:border-grey-700">
          <Table>
            <TableCaption>
              Seite und Qualität stammen aus der Nutzlast, Vektor aus dem gespeicherten Vektor
              selbst. Zeichen und Tabelle (erkannt) werden beim Lesen aus dem gespeicherten Text
              berechnet.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Seite</TableHead>
                <TableHead>Zeichen</TableHead>
                <TableHead>Qualität</TableHead>
                <TableHead>Tabelle (erkannt)</TableHead>
                <TableHead>Vektor</TableHead>
                <TableHead>Suche</TableHead>
                <TableHead>Anfang</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.chunks.map((chunk) => (
                <ChunkRow
                  key={chunk.index}
                  chunk={chunk}
                  qualityThreshold={data.header.qualityThreshold}
                  hitSimilarity={hitByIndex.get(chunk.index) ?? null}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset((v) => Math.max(0, v - CHUNK_PAGE_SIZE))}
          className="text-sm underline-offset-2 hover:underline disabled:text-grey-400"
        >
          Vorherige Seite
        </button>
        <button
          type="button"
          disabled={data.nextOffset === null}
          onClick={() => setOffset(data.nextOffset ?? offset)}
          className="text-sm underline-offset-2 hover:underline disabled:text-grey-400"
        >
          Nächste Seite
        </button>
      </div>
    </div>
  );
}
