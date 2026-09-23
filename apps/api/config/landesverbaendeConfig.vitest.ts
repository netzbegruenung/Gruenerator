/**
 * Config guard for #3579: Thüringen and Bayern promise Wahlprogramm/Beschluss/
 * Regierungsprogramm PDFs in their notebook description, but no configured
 * source ever ingested them (the PDFs only existed as hand-run scripts:
 * scrape-thueringen.ts, scrape-bayern.ts). These tests pin the fix in config —
 * both PDFs must be reachable via an isPdfArchive + staticUrls content path on
 * an already-configured source, not a new one.
 *
 * Also guards for #3580 (LV curation): the Saarland "Termine" (category 122)
 * exclusion must stay on the blog path only — 8 real press releases also carry
 * Termine, so excluding it on the presse path would drop real content. And the
 * brandenburg archive-beschluesse source must never re-grow the 2023-page
 * duplicate path.
 */
import { describe, it, expect } from 'vitest';

import { getSourceById, LANDESVERBAENDE_CONFIG } from './landesverbaendeConfig.js';
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

  it("carries each PDF's curated date through into staticUrls, so it wins over the upload-year folder", () => {
    const wahlprogrammPath = source?.contentPaths.find((cp) => cp.type === 'wahlprogramm');
    const beschlussPath = source?.contentPaths.find((cp) => cp.type === 'beschluss');

    for (const [path, pdfs] of [
      [wahlprogrammPath, THUERINGEN_WAHLPROGRAMME],
      [beschlussPath, THUERINGEN_BESCHLUESSE],
    ] as const) {
      const entries = path?.staticUrls ?? [];
      pdfs.forEach((pdf, i) => {
        const entry = entries[i];
        expect(typeof entry === 'string' ? undefined : entry?.date).toBe(pdf.date);
      });
    }
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

describe('saarland-lv wpApi.excludeCategoryIds', () => {
  const source = LANDESVERBAENDE_CONFIG.sources.find((s) => s.id === 'saarland-lv');

  it('does not exclude category 122 (Termine) on the presse path', () => {
    const pressePath = source?.contentPaths.find((p) => p.path === '/category/pressemitteilungen/');

    expect(pressePath?.wpApi?.excludeCategoryIds ?? []).not.toContain(122);
  });

  it('excludes category 122 (Termine) on the blog path', () => {
    const blogPath = source?.contentPaths.find(
      (p) => p.type === 'blog' && p.wpApi?.categoryIds != null
    );

    expect(blogPath?.wpApi?.excludeCategoryIds).toContain(122);
  });
});

describe('brandenburg-archive-beschluesse', () => {
  it('never points a content path at the 2022-1 (2023) duplicate page', () => {
    const source = LANDESVERBAENDE_CONFIG.sources.find(
      (s) => s.id === 'brandenburg-archive-beschluesse'
    );

    const paths = source?.contentPaths.map((p) => p.path) ?? [];

    expect(paths.some((path) => path.includes('2022-1'))).toBe(false);
  });
});
