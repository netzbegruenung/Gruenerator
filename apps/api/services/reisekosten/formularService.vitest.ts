/**
 * The blank form comes from the private content checkout. A missing or broken
 * file must answer null (the router turns that into 503), never throw, and a
 * good one is read once per process.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FORM_FIELD_KEYS } from '@gruenerator/contracts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reisekosten-formular-'));

vi.mock('../skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

const { clearFormularCache, getFormular } = await import('./formularService.js');

const box = { x: 1, y: 2, w: 3, h: 4 };
const col = { x: 1, w: 2 };
const row = { y: 1, h: 2 };
const MAP = {
  version: '2025-07',
  rateKey: 'de-DE/nrw',
  formPage: 0,
  fontSize: 9,
  fields: Object.fromEntries(FORM_FIELD_KEYS.map((k) => [k, { ...box, align: 'left' }])),
  checkboxes: { lv_bezahlt: box, beleg: box, pauschal: box },
  verpflegung: {
    columns: [col, col, col, col],
    summe: col,
    rows: { eintaegig: row, anreise: row, zwischen: row, abreise: row, abzug: row },
  },
  whiteouts: [box],
};

const dir = path.join(root, 'reisekosten');
const pdfPath = path.join(dir, 'nrw-2025-07.pdf');
const mapPath = path.join(dir, 'nrw-2025-07.map.json');

beforeEach(() => {
  clearFormularCache();
  fs.rmSync(dir, { recursive: true, force: true });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function writeFixture(map: unknown = MAP) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.7 fake'));
  fs.writeFileSync(mapPath, JSON.stringify(map));
}

describe('getFormular', () => {
  it('answers null when the files are not deployed', async () => {
    expect(await getFormular('de-DE/nrw')).toBeNull();
  });

  it('answers null when the map does not validate', async () => {
    writeFixture({ ...MAP, fields: {} });
    expect(await getFormular('de-DE/nrw')).toBeNull();
  });

  it('answers null when the map is not JSON', async () => {
    writeFixture();
    fs.writeFileSync(mapPath, '{not json');
    expect(await getFormular('de-DE/nrw')).toBeNull();
  });

  it('returns the PDF as base64 and the parsed map', async () => {
    writeFixture();
    const result = await getFormular('de-DE/nrw');
    expect(Buffer.from(result!.pdfBase64, 'base64').toString()).toBe('%PDF-1.7 fake');
    expect(result!.map.version).toBe('2025-07');
  });

  it('caches the first successful read', async () => {
    writeFixture();
    const first = await getFormular('de-DE/nrw');
    fs.rmSync(dir, { recursive: true, force: true });
    expect(await getFormular('de-DE/nrw')).toBe(first);
  });

  it('does not cache a miss', async () => {
    expect(await getFormular('de-DE/nrw')).toBeNull();
    writeFixture();
    expect(await getFormular('de-DE/nrw')).not.toBeNull();
  });
});
