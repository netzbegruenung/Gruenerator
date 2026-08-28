import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CloudPathError } from '../../utils/validation/cloudPaths.js';

import NextcloudApiClient, { isWebdavSelfEntry } from './nextcloudApiClient.js';

const PREFIX = '/public.php/webdav';

/**
 * Wächter: der Nextcloud-Client ist bewusst rein lesend (nur PROPFIND und
 * GET). Wolke-Verbindungen laufen über öffentliche Share-Tokens — jede
 * Schreibfähigkeit hier wäre eine Schreibfähigkeit für jeden, der ein Token
 * kennt. Wer PUT/DELETE/MKCOL/MOVE/COPY/PROPPATCH wieder einführt, muss diesen
 * Test bewusst anfassen und das im PR begründen.
 */
describe('read-only guard', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'nextcloudApiClient.ts'),
    'utf8'
  );

  it('issues no WebDAV write verbs', () => {
    for (const verb of ['MKCOL', 'PROPPATCH', "'PUT'", "'DELETE'", "'MOVE'", "'COPY'"]) {
      expect(source, `write verb ${verb} found in nextcloudApiClient.ts`).not.toContain(verb);
    }
  });

  it('uses no writing axios/fetch helpers', () => {
    for (const call of ['.put(', '.delete(', '.post(', '.patch(', "method: 'PUT'"]) {
      expect(source, `writing helper ${call} found in nextcloudApiClient.ts`).not.toContain(call);
    }
  });
});

describe('isWebdavSelfEntry', () => {
  it('recognises the listed folder in its own listing', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/`, `${PREFIX}/Stadtrat`)).toBe(true);
  });

  it('keeps a child that merely starts with the same name', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/Stadtrat/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });

  it('keeps a real subfolder', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/2026/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });

  it('matches through percent-encoding', () => {
    expect(
      isWebdavSelfEntry(`${PREFIX}/Antr%C3%A4ge%202026/`, `${PREFIX}/Antr%C3%A4ge%202026`)
    ).toBe(true);
  });

  it('matches a nested folder path', () => {
    expect(
      isWebdavSelfEntry(`${PREFIX}/Stadtrat/Antr%C3%A4ge/`, `${PREFIX}/Stadtrat/Antr%C3%A4ge`)
    ).toBe(true);
  });

  it('does not throw on a malformed escape and keeps the entry', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/100%/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });
});

/**
 * #3043: der Pfad-Wächter sitzt an der Transportschicht, weil es NEUN Aufrufer
 * gibt und vier davon einen Pfad annehmen, den jemand anderes geschrieben hat.
 * Der Konstruktor genügt hier — `create()` würde eine DNS-Auflösung auslösen,
 * und der Wächter greift bewusst davor, es geht ohnehin nichts hinaus.
 */
describe('path guard', () => {
  const client = new NextcloudApiClient('https://wolke.example/s/AbCdEf');
  const escapes = ['../../secrets', `${PREFIX}/../../remote.php/dav`, '%2e%2e/secrets'];

  for (const bad of escapes) {
    it(`refuses to list "${bad}"`, async () => {
      await expect(client.listFolder(bad)).rejects.toThrow(CloudPathError);
    });

    it(`refuses to download "${bad}"`, async () => {
      await expect(client.downloadFile(bad)).rejects.toThrow(CloudPathError);
    });
  }

  it('reports the refusal as itself, not as a generic listing failure', async () => {
    // Der Wächter steht VOR dem try. Stünde er darin, käme er als
    // „Failed to list folder" heraus und jeder Aufrufer müsste raten.
    await expect(client.listFolder('../x')).rejects.toThrow(/nicht aus der Freigabe/);
  });
});
