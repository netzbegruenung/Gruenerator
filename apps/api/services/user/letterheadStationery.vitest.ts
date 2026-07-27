/**
 * Der Dateiname des Briefbogens kommt aus der Datenbank, nicht aus dem Request
 * — trotzdem darf er nicht aus dem Nutzerverzeichnis herausführen. Eine per
 * Hand oder über eine spätere Lücke gesetzte Zeile wie "../../../.env" wäre
 * sonst ein Leseprimitiv auf das Dateisystem des Servers.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  deleteStationery,
  readStationery,
  saveStationery,
  stationeryTypeOf,
} from './letterheadStationery.js';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('letterheadStationery', () => {
  const written: string[] = [];

  afterAll(async () => {
    for (const file of written) await deleteStationery(USER, file);
  });

  it('speichert und liest einen Bogen zurück', async () => {
    const fileName = await saveStationery(USER, Buffer.from('%PDF-1.7 test'), 'pdf');
    written.push(fileName);

    const read = await readStationery(USER, fileName);
    expect(read?.type).toBe('pdf');
    expect(read?.bytes.toString()).toBe('%PDF-1.7 test');
  });

  it('liest nichts aus einem fremden Nutzerverzeichnis', async () => {
    const fileName = await saveStationery(USER, Buffer.from('geheim'), 'pdf');
    written.push(fileName);

    expect(await readStationery(OTHER, fileName)).toBeNull();
  });

  it('führt mit einem manipulierten Dateinamen nicht aus dem Verzeichnis heraus', async () => {
    // Eine Datei, die es wirklich gibt — der Test bewiese sonst nur, dass ein
    // nicht existierender Pfad nicht gelesen wird.
    const outside = path.join(os.tmpdir(), `stationery-escape-${process.pid}.pdf`);
    await fs.writeFile(outside, '%PDF-1.7 fremd');
    try {
      const relative = path.relative(
        path.join(process.cwd(), 'uploads/letterhead-stationery', USER),
        outside
      );
      expect(relative.startsWith('..')).toBe(true);
      expect(await readStationery(USER, relative)).toBeNull();
      expect(await readStationery(USER, '../../../package.json')).toBeNull();
    } finally {
      await fs.unlink(outside).catch(() => {});
    }
    // Die Datei außerhalb muss unangetastet sein — auch das Löschen darf nicht
    // ausbrechen.
    await deleteStationery(USER, '../../../package.json');
    await expect(fs.access(path.join(process.cwd(), 'package.json'))).resolves.toBeUndefined();
  });

  it('erkennt nur die drei einbettbaren Formate', () => {
    expect(stationeryTypeOf('a.pdf')).toBe('pdf');
    expect(stationeryTypeOf('a.PNG')).toBe('png');
    expect(stationeryTypeOf('a.jpeg')).toBe('jpg');
    expect(stationeryTypeOf('a.svg')).toBeNull();
    expect(stationeryTypeOf('a')).toBeNull();
  });
});
