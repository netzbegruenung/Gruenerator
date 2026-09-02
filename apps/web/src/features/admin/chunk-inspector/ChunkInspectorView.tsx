import { type InspectedChunk, type InspectedDocumentHeader } from '@gruenerator/contracts';
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';
import { useState } from 'react';

import { CHUNK_PAGE_SIZE, useDocumentChunks } from '../hooks/useChunkInspector';

const NOT_STORED = 'nicht gespeichert';

function HeaderField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-3xs">
      <dt className="text-xs uppercase tracking-wide text-grey-500 dark:text-grey-400">{label}</dt>
      <dd className={value === null ? 'text-sm italic text-grey-500' : 'text-sm text-foreground'}>
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
        label="Indiziert am"
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
}: {
  chunk: InspectedChunk;
  qualityThreshold: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const belowThreshold =
    chunk.qualityScore !== null &&
    qualityThreshold !== null &&
    chunk.qualityScore < qualityThreshold;

  return (
    <>
      <TableRow id={`chunk-${chunk.index}`}>
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
            <span className="italic text-grey-500">{NOT_STORED}</span>
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
        <TableCell className="max-w-md truncate">{chunk.text.slice(0, 300)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7}>
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
}: {
  documentId: string;
  collection: string;
}) {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError } = useDocumentChunks(documentId, collection, offset);

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
        Die Chunks konnten nicht geladen werden.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <DocumentHeader header={data.header} />

      {data.chunks.length === 0 ? (
        <p className="py-lg text-center text-sm text-grey-500 dark:text-grey-400">
          Zu diesem Dokument liegen keine Chunks vor.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-grey-200 dark:border-grey-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Seite</TableHead>
                <TableHead>Zeichen</TableHead>
                <TableHead>Qualität</TableHead>
                <TableHead>Tabelle</TableHead>
                <TableHead>Vektor</TableHead>
                <TableHead>Anfang</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.chunks.map((chunk) => (
                <ChunkRow
                  key={chunk.index}
                  chunk={chunk}
                  qualityThreshold={data.header.qualityThreshold}
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
