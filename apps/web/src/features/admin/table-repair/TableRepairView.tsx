import {
  TABLE_REPAIR_BATCH_MAX,
  TABLE_REPAIR_SCAN_MAX,
  type TableRepairFinding,
  type TableRepairResultStatus,
  type TableRepairSource,
} from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { AdminEmptyState, AdminPanel, AdminStat, AdminStatGrid } from '../components/adminUi';

import { repairTableSources, scanTablePage } from './tableRepairApi';

const SOURCE_LABEL: Record<TableRepairSource, string> = {
  original: 'Original',
  wolke: 'Wolke',
  'stored-text': 'Gespeicherter Text',
};

const RESULT_LABEL: Record<TableRepairResultStatus, string> = {
  queued: 'Eingereiht',
  unavailable: 'Kein Original mehr',
  not_found: 'Nicht gefunden',
  consent_missing: 'Keine KI-Einwilligung',
  forbidden: 'Kein Zugriff',
};

const count = (findings: TableRepairFinding[], state: TableRepairFinding['state']) =>
  findings.filter((f) => f.state === state).length;

function CandidateRow({
  finding,
  result,
}: {
  finding: TableRepairFinding;
  result: TableRepairResultStatus | undefined;
}) {
  return (
    <li className="flex list-none flex-wrap items-baseline gap-x-md border-t border-grey-200 px-md py-sm first:border-t-0 dark:border-grey-800">
      <Link
        to={`/admin/chunks/${encodeURIComponent(finding.documentId)}?collection=documents`}
        className="font-mono text-sm text-primary-700 underline dark:text-primary-400"
      >
        {finding.documentId.slice(0, 8)}
      </Link>
      <span className="text-sm text-foreground">
        {finding.extension.replace('.', '').toUpperCase()} ·{' '}
        {finding.source ? SOURCE_LABEL[finding.source] : '–'}
      </span>
      {finding.missedPages.length > 0 && (
        <span className="text-xs text-grey-600 dark:text-grey-400">
          {finding.missedPages.length === 1 ? 'Seite' : 'Seiten'} {finding.missedPages.join(', ')}
        </span>
      )}
      {result && (
        <span
          className={
            result === 'queued'
              ? 'ml-auto text-xs font-medium text-primary-700 dark:text-primary-400'
              : 'ml-auto text-xs font-medium text-red-700 dark:text-red-300'
          }
        >
          {RESULT_LABEL[result]}
        </span>
      )}
    </li>
  );
}

/**
 * Tabellen-Reparatur: prüft die Quellen aller Nutzer*innen seitenweise und
 * reiht die reparierbaren über „Neu indexieren" ein. Titel und Dateinamen
 * erscheinen bewusst nicht; eine Quelle öffnet der Link im Chunk-Inspektor.
 */
export default function TableRepairView() {
  const [findings, setFindings] = useState<TableRepairFinding[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [results, setResults] = useState<Map<string, TableRepairResultStatus>>(new Map());
  const stopRef = useRef(false);

  const candidates = findings.filter((f) => f.state === 'fixable');
  const open = candidates.filter((f) => !results.has(f.documentId));
  const pdfPages = open.reduce((sum, f) => sum + f.missedPages.length, 0);

  async function scan() {
    stopRef.current = false;
    setFindings([]);
    setResults(new Map());
    setTotal(null);
    setError(null);
    setConfirming(false);
    setPhase('scanning');
    try {
      let cursor: string | null = null;
      do {
        const page = await scanTablePage(cursor, TABLE_REPAIR_SCAN_MAX);
        if (page.total !== null) setTotal(page.total);
        setFindings((prev) => [...prev, ...page.findings]);
        cursor = page.nextCursor;
      } while (cursor && !stopRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prüfung fehlgeschlagen.');
    }
    setPhase('done');
  }

  async function repair() {
    setConfirming(false);
    setRepairing(true);
    setError(null);
    try {
      const ids = open.map((f) => f.documentId);
      for (let i = 0; i < ids.length; i += TABLE_REPAIR_BATCH_MAX) {
        const batch = await repairTableSources(ids.slice(i, i + TABLE_REPAIR_BATCH_MAX));
        setResults((prev) => {
          const next = new Map(prev);
          for (const r of batch) next.set(r.documentId, r.status);
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neu indexieren fehlgeschlagen.');
    }
    setRepairing(false);
  }

  return (
    <>
      <AdminPanel>
        <p className="m-0 max-w-[72ch] text-sm text-grey-600 dark:text-grey-400">
          Sucht Quellen, deren Tabellen ein neuer Lauf besser lesen würde: PDFs mit Tabellenseiten,
          die die frühere Erkennung übersehen hat, und Tabellendateien, die noch als Fliesstext im
          Index stehen. Reparierbar ist, wovon das Original vorliegt (Uploads seit 23.11.2026,
          Wolke) — oder bei einer CSV der gespeicherte Text. PDFs aus der Wolke werden nicht
          geöffnet.
        </p>
        <div className="mt-md flex flex-wrap gap-sm">
          <Button
            variant="brand"
            disabled={phase === 'scanning' || repairing}
            onClick={() => void scan()}
          >
            {phase === 'idle' ? 'Prüfung starten' : 'Erneut prüfen'}
          </Button>
          {phase === 'scanning' && (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              Anhalten
            </Button>
          )}
        </div>
      </AdminPanel>

      {error && (
        <p role="alert" className="m-0 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {phase !== 'idle' && (
        <AdminStatGrid>
          <AdminStat
            label="Geprüft"
            value={findings.length}
            hint={total !== null ? `von ${total}` : undefined}
          />
          <AdminStat label="Reparierbar" value={candidates.length} />
          <AdminStat label="PDF-Seiten an Mistral" value={pdfPages} hint="bei den offenen" />
          <AdminStat label="Ohne Original" value={count(findings, 'no_original')} />
          <AdminStat label="Wolke-PDFs ungeprüft" value={count(findings, 'wolke_unchecked')} />
          <AdminStat label="Unlesbar" value={count(findings, 'unreadable')} />
        </AdminStatGrid>
      )}

      {phase === 'done' && candidates.length === 0 && !error && (
        <AdminEmptyState>Keine reparierbaren Quellen gefunden.</AdminEmptyState>
      )}

      {candidates.length > 0 && (
        <AdminPanel
          flush
          title="Reparierbare Quellen"
          aside={
            open.length > 0 &&
            phase === 'done' && (
              <Button
                variant="brand"
                size="sm"
                disabled={repairing}
                onClick={() => setConfirming(true)}
              >
                {open.length} neu indexieren
              </Button>
            )
          }
        >
          {confirming && (
            <div
              role="alertdialog"
              aria-label="Neu indexieren bestätigen"
              className="mx-md mb-sm flex flex-wrap items-center gap-sm rounded-lg border border-grey-200 p-sm text-sm dark:border-grey-800"
            >
              <span className="flex-1 basis-72">
                {open.length} Quellen werden neu gelesen
                {pdfPages > 0 && `, etwa ${pdfPages} PDF-Seiten gehen an Mistral OCR`}. Die
                bisherige Fassung bleibt durchsuchbar, bis die neue steht.
              </span>
              <Button variant="brand" size="sm" onClick={() => void repair()}>
                Bestätigen
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Abbrechen
              </Button>
            </div>
          )}
          <ul className="m-0 p-0">
            {candidates.map((f) => (
              <CandidateRow key={f.documentId} finding={f} result={results.get(f.documentId)} />
            ))}
          </ul>
        </AdminPanel>
      )}
    </>
  );
}
