import { describe, expect, it } from 'vitest';

import {
  failureNotice,
  joinNotices,
  subfolderNotice,
  summarizeWolkeImport,
  unsupportedFileNotice,
  wolkeFailureLabel,
} from './wolkeImportSummary';

import type { WolkeFile, WolkeImportResult } from '../../../stores/documentsStore';

function file(partial: Partial<WolkeFile> & { name: string }): WolkeFile {
  return {
    href: `/public.php/webdav/${partial.name}`,
    fileExtension: '',
    isSupported: false,
    sizeFormatted: '1 KB',
    lastModified: '01.01.2026',
    ...partial,
  };
}

describe('summarizeWolkeImport', () => {
  it('separates imports, benign skips and failures', () => {
    const results: WolkeImportResult[] = [
      { filename: 'a.pdf', success: true, documentId: 'doc-a' },
      {
        filename: 'b.pdf',
        success: false,
        skipped: true,
        reason: 'already_imported',
        documentId: 'doc-b',
      },
      {
        filename: 'c.pdf',
        success: false,
        skipped: true,
        reason: 'up_to_date',
        documentId: 'doc-c',
      },
      { filename: 'd.pdf', success: false, skipped: true, reason: 'no_extractable_text' },
      { filename: 'e.pdf', success: false, reason: 'processing_failed', error: 'boom' },
    ];

    const summary = summarizeWolkeImport(results);

    expect(summary.imported).toEqual([{ id: 'doc-a', title: 'a.pdf' }]);
    expect(summary.alreadyImported.map((d) => d.id)).toEqual(['doc-b', 'doc-c']);
    expect(summary.failures.map((f) => f.filename)).toEqual(['d.pdf', 'e.pdf']);
  });

  it('counts a file with no reason at all as a failure, not as success', () => {
    const summary = summarizeWolkeImport([{ filename: 'x.pdf', success: false }]);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].label).toBe('Verarbeitung fehlgeschlagen');
  });

  it('drops a benign skip that carries no documentId — it identifies nothing', () => {
    const summary = summarizeWolkeImport([
      { filename: 'x.pdf', success: false, skipped: true, reason: 'up_to_date' },
    ]);
    expect(summary.alreadyImported).toHaveLength(0);
    expect(summary.failures).toHaveLength(0);
  });

  it('never treats a success without documentId as imported', () => {
    const summary = summarizeWolkeImport([{ filename: 'x.pdf', success: true }]);
    expect(summary.imported).toHaveLength(0);
    expect(summary.failures).toHaveLength(1);
  });
});

describe('wolkeFailureLabel', () => {
  it('maps known reasons to German labels', () => {
    expect(wolkeFailureLabel('no_extractable_text')).toBe('kein Text auslesbar');
    expect(wolkeFailureLabel('file_too_large')).toBe('größer als 100 MB');
  });

  it('falls back for unknown or missing reasons instead of leaking them', () => {
    expect(wolkeFailureLabel('some_new_backend_reason')).toBe('Verarbeitung fehlgeschlagen');
    expect(wolkeFailureLabel(undefined)).toBe('Verarbeitung fehlgeschlagen');
  });
});

describe('failureNotice', () => {
  it('is null when nothing failed', () => {
    expect(failureNotice([])).toBeNull();
  });

  it('names a single failure with its reason', () => {
    const notice = failureNotice([
      { filename: 'Geschichte.pdf', reason: 'no_extractable_text', label: 'kein Text auslesbar' },
    ]);
    expect(notice).toBe(
      '1 Datei konnte nicht importiert werden: „Geschichte.pdf" (kein Text auslesbar).'
    );
  });

  it('caps the list at three names and counts the rest', () => {
    const failures = ['a', 'b', 'c', 'd', 'e'].map((n) => ({
      filename: `${n}.pdf`,
      reason: 'processing_failed',
      label: 'Verarbeitung fehlgeschlagen',
    }));
    const notice = failureNotice(failures);
    expect(notice).toContain('5 Dateien konnten nicht importiert werden');
    expect(notice).toContain('und 2 weitere');
    expect(notice).not.toContain('d.pdf');
  });
});

describe('unsupportedFileNotice', () => {
  it('ignores directories — they are not skipped files', () => {
    expect(unsupportedFileNotice([file({ name: 'Stadtrat', isDirectory: true })])).toBeNull();
  });

  it('lists the distinct extensions that were skipped', () => {
    const notice = unsupportedFileNotice([
      file({ name: 'a.odt', fileExtension: '.odt' }),
      file({ name: 'b.xlsx', fileExtension: '.xlsx' }),
      file({ name: 'c.odt', fileExtension: '.odt' }),
      file({ name: 'ok.pdf', fileExtension: '.pdf', isSupported: true }),
    ]);
    expect(notice).toBe('3 Dateien in nicht unterstützten Formaten (.odt, .xlsx) übersprungen.');
  });

  it('is null when every file is supported', () => {
    expect(
      unsupportedFileNotice([file({ name: 'ok.pdf', fileExtension: '.pdf', isSupported: true })])
    ).toBeNull();
  });
});

describe('subfolderNotice', () => {
  it('names subfolders that were left behind when recursion is off', () => {
    expect(subfolderNotice({ folderCount: 6 }, false)).toBe(
      '6 Unterordner wurden nicht mitgezogen — schalte „Unterordner einbeziehen" ein.'
    );
  });

  it('uses the singular for exactly one', () => {
    expect(subfolderNotice({ folderCount: 1 }, false)).toContain('1 Unterordner wurde');
  });

  it('says nothing when there are no subfolders', () => {
    expect(subfolderNotice({ folderCount: 0 }, false)).toBeNull();
    expect(subfolderNotice({}, false)).toBeNull();
  });

  it('stays quiet about subfolders that WERE pulled', () => {
    expect(subfolderNotice({ folderCount: 6 }, true)).toBeNull();
  });

  it('reports the depth limit only when recursion actually hit it', () => {
    expect(subfolderNotice({ folderCount: 6, depthLimited: true }, true)).toBe(
      'Der Ordner ist mehr als 3 Ebenen tief — der Rest wurde nicht mitgezogen.'
    );
  });

  it('reports both limits together', () => {
    expect(subfolderNotice({ depthLimited: true, truncated: true }, true)).toContain(
      'mehr als 3 Ebenen tief und mehr als 500 Dateien'
    );
  });
});

describe('joinNotices', () => {
  it('drops nulls and joins the rest', () => {
    expect(joinNotices([null, 'A.', null, 'B.'])).toBe('A. B.');
  });

  it('is null when there is nothing to say', () => {
    expect(joinNotices([null, null])).toBeNull();
  });
});
