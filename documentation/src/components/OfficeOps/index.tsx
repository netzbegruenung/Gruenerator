import React from 'react';

import manifestJson from '@site/src/generated/office.json';

import { OP_NOTES } from './opNotes';
import styles from './styles.module.css';

interface Operation {
  id: string;
  doc?: string;
  variants?: string[];
  disabled?: boolean;
  disabledReason?: string;
}
interface Surface {
  operations: Operation[];
  maxOperations?: number;
}
interface Manifest {
  documents: {
    subtypes: string[];
    typeLabels: Record<string, string>;
    sharing: { modes: string[]; permissions: string[] };
  };
  sheets: Surface & { import: { formats: string[]; maxSizeMB: number } };
  presentations: Surface & { slideLayouts: string[]; slideTransitions: string[] };
  boards: {
    presets: Record<string, { label: string; description: string }>;
    flowSources: string[];
    flowTasks: string[];
    flowOutputs: string[];
  };
}

const manifest = manifestJson as Manifest;

type SurfaceKey = 'sheets' | 'presentations';

/**
 * A live operation without an example sentence degrades to its name alone —
 * never to a broken page. `office:audit` reports it as a GitHub issue instead.
 * Disabled operations are exempt: they are rendered as unavailable, and asking
 * someone to write an example for them would be asking for a lie.
 */
function warnOnDrift(): void {
  if (process.env.NODE_ENV === 'production') return;
  for (const surface of ['sheets', 'presentations'] as SurfaceKey[]) {
    const missing = manifest[surface].operations
      .filter((op) => !op.disabled && !OP_NOTES[surface]?.[op.id])
      .map((op) => op.id);
    if (missing.length > 0) {
      console.warn(
        `[OfficeOps] ${surface}: ohne Beispielsatz und daher nur als Name gelistet: ${missing.join(', ')}. ` +
          `Ergänze sie in src/components/OfficeOps/opNotes.ts.`
      );
    }
  }
}

warnOnDrift();

function OperationCard({ op, surface }: { op: Operation; surface: SurfaceKey }): React.JSX.Element {
  const note = OP_NOTES[surface]?.[op.id];

  if (op.disabled) {
    return (
      <div className={`${styles.operation} ${styles.disabledCard}`}>
        <h4 className={styles.operationTitle}>{note?.what ?? op.id}</h4>
        <span className={`${styles.badge} ${styles.disabledBadge}`}>derzeit nicht verfügbar</span>
        {op.disabledReason && <p className={styles.description}>{op.disabledReason}</p>}
      </div>
    );
  }

  return (
    <div className={styles.operation}>
      <h4 className={styles.operationTitle}>{note?.what ?? op.id}</h4>
      {op.variants && op.variants.length > 0 && (
        <div className={styles.badges}>
          {op.variants.map((v) => (
            <span key={v} className={styles.badge}>
              {v}
            </span>
          ))}
        </div>
      )}
      {note && (
        <ul className={styles.examples}>
          {note.examples.map((example) => (
            <li key={example}>„{example}"</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The operations one editor surface understands, with example phrasings. */
export default function OfficeOps({ surface }: { surface: SurfaceKey }): React.JSX.Element {
  const { operations } = manifest[surface];
  // Disabled last: what works belongs at the top of the page.
  const ordered = [...operations].sort(
    (a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false)
  );

  return (
    <div className={styles.grid}>
      {ordered.map((op) => (
        <OperationCard key={op.id} op={op} surface={surface} />
      ))}
    </div>
  );
}

/** Inline facts, so prose never repeats a number the code owns. */
export function OfficeFact({
  name,
}: {
  name:
    | 'sheetImportFormats'
    | 'sheetImportMaxSize'
    | 'sheetMaxOperations'
    | 'presentationMaxOperations'
    | 'slideLayoutCount'
    | 'shareModes'
    | 'docTypes';
}): React.JSX.Element {
  switch (name) {
    case 'sheetImportFormats':
      return <>{manifest.sheets.import.formats.join(', ')}</>;
    case 'sheetImportMaxSize':
      return <>{manifest.sheets.import.maxSizeMB} MB</>;
    case 'sheetMaxOperations':
      return <>{manifest.sheets.maxOperations}</>;
    case 'presentationMaxOperations':
      return <>{manifest.presentations.maxOperations}</>;
    case 'slideLayoutCount':
      return <>{manifest.presentations.slideLayouts.length}</>;
    case 'shareModes':
      return <>{manifest.documents.sharing.modes.length}</>;
    case 'docTypes':
      return <>{Object.values(manifest.documents.typeLabels).join(', ')}</>;
    default:
      return <>{name}</>;
  }
}

/** The Grünerator-Spalte's curated task presets, straight from the contract. */
export function BoardPresets(): React.JSX.Element {
  return (
    <div className={styles.grid}>
      {Object.entries(manifest.boards.presets).map(([id, preset]) => (
        <div key={id} className={styles.operation}>
          <h4 className={styles.operationTitle}>{preset.label}</h4>
          <p className={styles.description}>{preset.description}</p>
        </div>
      ))}
    </div>
  );
}
