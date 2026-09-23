/**
 * Config guard for #3579: Thüringen and Bayern promise Wahlprogramm/Beschluss/
 * Regierungsprogramm PDFs in their notebook description, but no configured
 * source ever ingested them (the PDFs only existed as hand-run scripts:
 * scrape-thueringen.ts, scrape-bayern.ts). These tests pin the fix in config —
 * both PDFs must be reachable via an isPdfArchive + staticUrls content path on
 * an already-configured source, not a new one.
 */
import { describe, it, expect } from 'vitest';

import { getSourceById } from './landesverbaendeConfig.js';
import { THUERINGEN_WAHLPROGRAMME, THUERINGEN_BESCHLUESSE } from './thueringenSources.js';

describe('thueringen-lv — Wahlprogramm/Beschluss PDF paths (#3579)', () => {
  const source = getSourceById('thueringen-lv');

  it('exists', () => {
    expect(source).toBeDefined();
  });

  it('has an isPdfArchive wahlprogramm path with all Wahlprogramm PDFs as staticUrls, skipped hourly', () => {
    const path = source?.contentPaths.find((cp) => cp.type === 'wahlprogramm');
    expect(path?.isPdfArchive).toBe(true);
    expect(path?.recentSkip).toBe(true);
    expect(path?.staticUrls?.length).toBe(THUERINGEN_WAHLPROGRAMME.length);
  });

  it('has an isPdfArchive beschluss path with all Beschluss PDFs as staticUrls, skipped hourly', () => {
    const path = source?.contentPaths.find((cp) => cp.type === 'beschluss');
    expect(path?.isPdfArchive).toBe(true);
    expect(path?.recentSkip).toBe(true);
    expect(path?.staticUrls?.length).toBe(THUERINGEN_BESCHLUESSE.length);
  });

  it('does not re-enable the dormant thueringen-fraktion source', () => {
    const fraktion = getSourceById('thueringen-fraktion');
    expect(fraktion?.dormant).toBe(true);
  });
});

describe('bayern — Regierungsprogramm PDF path (#3579)', () => {
  it('is configured on an existing Bayern LV source as isPdfArchive + staticUrls', () => {
    const sourceIds = ['bayern-lv-beschluesse', 'bayern-lv-presse'] as const;
    const matches = sourceIds
      .map((id) => getSourceById(id))
      .flatMap((source) => source?.contentPaths ?? [])
      .filter((cp) => cp.isPdfArchive)
      .flatMap((cp) => cp.staticUrls ?? [])
      .filter(
        (entry) =>
          (typeof entry === 'string' ? entry : entry.url) ===
          'https://www.gruene-bayern.de/dateien/Regierungsprogramm_final_22_06_2023.pdf'
      );

    expect(matches).toHaveLength(1);
    const entry = matches[0];
    expect(typeof entry === 'string' ? undefined : entry.title).toBe(
      'Regierungsprogramm der Grünen Bayern 2023'
    );
  });
});
