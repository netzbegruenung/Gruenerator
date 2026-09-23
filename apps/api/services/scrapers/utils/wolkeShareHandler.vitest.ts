/**
 * Guards the default draft/side-file exclusion list for Wolke share discovery.
 * A production check of LV Berlin's Wahlprüfsteine share (271 files) found
 * drafts and side files stored as if they were final answers — see
 * `isExcludedWolkeFileName`'s call site in `collectWolkeShareFiles`.
 */
import { describe, expect, it, vi } from 'vitest';

import { collectWolkeShareFiles, isExcludedWolkeFileName } from './wolkeShareHandler.js';

describe('isExcludedWolkeFileName', () => {
  it.each([
    '2026-06-23-WPS-Gruene-Berlin-NABU_Antwortentwurf.pdf',
    '2026-06-23-WPS-Gruene-Berlin-Abgeordnetenwatch-Antwortvorlage.pdf',
    '2026-06-23-WPS-Gruene-Berlin-DWE-Antwortvorlage.pdf',
    '2026-06-23-WPS-Gruene-Berlin-verdi_Kita-Antwortvorlage.pdf',
    '2026-06-23-WPS-Gruene-Berlin_Landesmusikrat_Anschreiben.pdf',
    '2026-06-23-WPS-Gruene-Berlin_ausgefülltes Formular.pdf',
  ])('excludes drafts and side files by default: %s', (name) => {
    expect(isExcludedWolkeFileName(name)).toBe(true);
  });

  it.each([
    'WPS-Gruene-Berlin-2026-06-23-ADFC-Antwort.pdf',
    '20210827_Grüne Antworten_WPS_Stadt für Menschen.pdf',
  ])('keeps normal answer files: %s', (name) => {
    expect(isExcludedWolkeFileName(name)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isExcludedWolkeFileName('ENTWURF-Antwort.pdf')).toBe(true);
  });

  it('matches on the file name only, not any folder path segment', () => {
    // The predicate itself only ever sees a file name (no path separator), but
    // an already-excluded-looking prefix must not slip through if it weren't
    // for a real match — this documents that "entwurf" placed anywhere in the
    // name is enough, without requiring the whole string.
    expect(isExcludedWolkeFileName('Antwort-Entwurf-v2.pdf')).toBe(true);
  });

  it('matches "intern" only as a word', () => {
    expect(isExcludedWolkeFileName('Protokoll_intern.pdf')).toBe(true);
    expect(isExcludedWolkeFileName('Intern-Vermerk.pdf')).toBe(true);
    expect(isExcludedWolkeFileName('WPS_Internationale Jugendarbeit-Antwort.pdf')).toBe(false);
    expect(isExcludedWolkeFileName('20210601_Grüne Antworten_WPS_Internet.pdf')).toBe(false);
  });

  it('extends the defaults with extra case-insensitive substrings', () => {
    expect(isExcludedWolkeFileName('Geheimpapier.pdf')).toBe(false);
    expect(isExcludedWolkeFileName('Geheimpapier.pdf', ['geheim'])).toBe(true);
    // Defaults still apply once `extra` is given.
    expect(isExcludedWolkeFileName('Antwortentwurf.pdf', ['geheim'])).toBe(true);
  });
});

vi.mock('../../api-clients/nextcloudApiClient.js', () => ({
  default: { create: vi.fn(async () => ({ listFolder: vi.fn() })) },
}));
vi.mock('../../OcrService/index.js', () => ({ ocrService: {} }));
vi.mock('../../sync/folderWalk.js', () => ({
  walkWolkeFolder: vi.fn(async () => ({
    files: [
      {
        name: 'Antwort.pdf',
        href: '/public.php/webdav/Antwort.pdf',
        etag: 'e1',
        lastModified: null,
      },
      {
        name: 'Grüne Antwort (ADFC).pdf',
        href: '/public.php/webdav/WPS%202026/Unterordner/Gr%C3%BCne%20Antwort%20(ADFC).pdf',
        etag: 'e2',
        lastModified: null,
      },
    ],
  })),
}));

describe('collectWolkeShareFiles', () => {
  it('stores a token-free wolke:// url with the decoded relative path', async () => {
    const { files } = await collectWolkeShareFiles(
      'https://wolke.netzbegruenung.de/s/TESTTOKEN',
      'berlin-wps',
      true
    );
    expect(files.map((f) => f.url)).toEqual([
      'wolke://berlin-wps/Antwort.pdf',
      'wolke://berlin-wps/WPS 2026/Unterordner/Grüne Antwort (ADFC).pdf',
    ]);
    expect(files.every((f) => !f.url.includes('TESTTOKEN'))).toBe(true);
  });
});
