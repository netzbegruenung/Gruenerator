import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CloudPathError } from '../../utils/validation/cloudPaths.js';

import NextcloudApiClient, {
  NextcloudHttpError,
  WebdavParseError,
  classifyWebdavStatus,
  isWebdavSelfEntry,
  parseWebDAVResponse,
  statusOf,
} from './nextcloudApiClient.js';

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
 * #3038: das Namensraum-Präfix ist in XML beliebig. Dieselbe Antwort in vier
 * Schreibweisen muss dieselbe Dateiliste ergeben — vorher lieferten drei davon
 * stumm null Dateien, was jeder Aufrufer als „leerer Ordner" las.
 */
describe('parseWebDAVResponse', () => {
  /** Eine Antwort mit dem Ordner selbst, einem Unterordner und einer Datei. */
  function multistatus(p: string): string {
    const t = p ? `${p}:` : '';
    const xmlns = p ? `xmlns:${p}="DAV:"` : 'xmlns="DAV:"';
    return `<?xml version="1.0"?>
<${t}multistatus ${xmlns}>
  <${t}response><${t}href>${PREFIX}/</${t}href>
    <${t}propstat><${t}prop><${t}resourcetype><${t}collection/></${t}resourcetype></${t}prop></${t}propstat>
  </${t}response>
  <${t}response><${t}href>${PREFIX}/Antr%C3%A4ge/</${t}href>
    <${t}propstat><${t}prop>
      <${t}displayname>Anträge</${t}displayname>
      <${t}resourcetype><${t}collection/></${t}resourcetype>
    </${t}prop></${t}propstat>
  </${t}response>
  <${t}response><${t}href>${PREFIX}/rede.pdf</${t}href>
    <${t}propstat><${t}prop>
      <${t}displayname>rede.pdf</${t}displayname>
      <${t}getcontentlength>4096</${t}getcontentlength>
      <${t}getetag>&quot;abc123&quot;</${t}getetag>
      <${t}resourcetype/>
    </${t}prop></${t}propstat>
  </${t}response>
</${t}multistatus>`;
  }

  // `d:` ist, was Nextclouds sabre/dav heute schickt. Die anderen drei sind
  // dasselbe Dokument — und waren bis #3038 ein leerer Ordner.
  for (const prefix of ['d', 'D', 'dav', '']) {
    it(`reads the same listing with prefix "${prefix || '(none)'}"`, () => {
      const files = parseWebDAVResponse(multistatus(prefix), PREFIX);
      expect(files.map((f) => f.name)).toEqual(['Anträge', 'rede.pdf']);
      expect(files[0].isDirectory).toBe(true);
      expect(files[1].isDirectory).toBe(false);
      expect(files[1].size).toBe(4096);
      expect(files[1].etag).toBe('abc123');
    });
  }

  it('separates "the folder is empty" from "I did not read the answer"', () => {
    // Eine Hülle ohne Einträge ist eine gültige leere Antwort …
    expect(parseWebDAVResponse('<d:multistatus xmlns:d="DAV:"></d:multistatus>')).toEqual([]);
    // … alles andere ist ein Fehler und darf nicht als leerer Ordner
    // durchgehen. Genau diese Verwechslung ist der Kern von #3038.
    for (const notWebdav of ['', '<html><body>404</body></html>', '{"error":"nope"}']) {
      expect(() => parseWebDAVResponse(notWebdav)).toThrow(WebdavParseError);
    }
  });

  it('does not let responsedescription swallow the document', () => {
    // Ohne Wortgrenze fängt `response` auch `responsedescription`, und der
    // träge Bereich bis zum nächsten `</d:response>` verschlänge den Rest.
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:responsedescription>nichts zu sehen</d:responsedescription>
      <d:response><d:href>${PREFIX}/rede.pdf</d:href>
        <d:prop><d:displayname>rede.pdf</d:displayname></d:prop>
      </d:response>
    </d:multistatus>`;
    expect(parseWebDAVResponse(xml, PREFIX).map((f) => f.name)).toEqual(['rede.pdf']);
  });

  it('keeps the other entries when one is unreadable', () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:response><d:prop><d:displayname>ohne href</d:displayname></d:prop></d:response>
      <d:response><d:href>${PREFIX}/rede.pdf</d:href>
        <d:prop><d:displayname>rede.pdf</d:displayname></d:prop>
      </d:response>
    </d:multistatus>`;
    expect(parseWebDAVResponse(xml, PREFIX).map((f) => f.name)).toEqual(['rede.pdf']);
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
  const escapes = [
    '../../secrets',
    `${PREFIX}/../../remote.php/dav`,
    '%2e%2e/secrets',
    // Der Zweig, auf den es hier ankommt: ein Pfad MIT WebDAV-Präfix wird von
    // `downloadFile` roh durchgereicht, Prozent-Kodierung überlebt also bis auf
    // die Leitung — und ein kodierter Trenner hielt die Punkt-Segmente
    // zusammen, bis der Wächter nach dem Dekodieren neu trennte.
    `${PREFIX}/..%2f..%2fremote.php/dav`,
  ];

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

describe('classifyWebdavStatus', () => {
  // Live-measured semantics of public.php/webdav: auth is checked BEFORE path
  // resolution, so 401 always means the token was rejected (share deleted,
  // expired, or password-protected) — never a wrong path. 405 on a read verb
  // is a file-drop (upload only) share.
  it('maps the measured status codes to their one meaning', () => {
    expect(classifyWebdavStatus(401)).toBe('invalid_link');
    expect(classifyWebdavStatus(403)).toBe('forbidden');
    expect(classifyWebdavStatus(404)).toBe('not_found');
    expect(classifyWebdavStatus(405)).toBe('file_drop');
  });

  it('leaves everything else unclassified', () => {
    expect(classifyWebdavStatus(500)).toBe('unknown');
    expect(classifyWebdavStatus(undefined)).toBe('unknown');
  });
});

describe('NextcloudHttpError', () => {
  it('carries the status through, and statusOf reads it back', () => {
    const err = new NextcloudHttpError('nope', 405, 'Method Not Allowed');
    expect(statusOf(err)).toBe(405);
    expect(err.name).toBe('NextcloudHttpError');
  });

  it('statusOf yields undefined for foreign errors', () => {
    expect(statusOf(new Error('x'))).toBeUndefined();
    expect(statusOf('not even an error')).toBeUndefined();
  });
});
