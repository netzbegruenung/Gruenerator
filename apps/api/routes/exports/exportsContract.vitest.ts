/**
 * Vertragsebene: die Schnittstelle darf sich beim Renderer-Tausch NICHT ändern.
 *
 * Die ausgelieferte Mobile-App ruft `POST /api/exports/pdf` mit
 * `{ content, title }` auf und erwartet `application/pdf` als Rohbytes plus
 * einen Dateinamen im `Content-Disposition`. Sie wird nicht neu gebaut, wenn
 * der Server umgestellt wird — deshalb wird hier ausdrücklich die
 * Unveränderlichkeit des Vertrags geprüft, nicht die neue Funktionalität.
 */

import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mountExportsContractRouter } from './exportsContractRouter.js';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  mountExportsContractRouter(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

async function postPdf(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/exports/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/exports/pdf — Vertrag', () => {
  it('nimmt { content, title } an und liefert 200 mit PDF-Bytes', async () => {
    const res = await postPdf({ content: '# Titel\n\nEin Absatz.', title: 'Mein Dokument' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const bytes = Buffer.from(await res.arrayBuffer());
    // Der Body muss roh durchgereicht werden — ginge er durch res.json(),
    // käme base64 oder ein JSON-Objekt an und die Datei wäre unbrauchbar.
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  }, 60_000);

  it('behält das Dateinamensschema im Content-Disposition', async () => {
    const res = await postPdf({ content: 'Inhalt', title: 'Mein Dokument' });
    const disposition = res.headers.get('content-disposition') ?? '';

    expect(disposition).toContain('attachment');
    expect(disposition).toContain('Mein Dokument.pdf');
    await res.arrayBuffer();
  }, 60_000);

  it('kommt ohne title aus (Mobile schickt ihn, Web nicht immer)', async () => {
    const res = await postPdf({ content: '<p>Nur Inhalt</p>' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('Dokument.pdf');
    await res.arrayBuffer();
  }, 60_000);

  it('verarbeitet Editor-HTML genauso wie Markdown', async () => {
    const res = await postPdf({
      content: '<h1>Bericht</h1><ul><li>Erstens</li><li>Zweitens</li></ul>',
      title: 'HTML',
    });

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBeGreaterThan(1000);
  }, 60_000);

  it('weist fehlendes content ab, ohne einen Fehler als PDF zu tarnen', async () => {
    const res = await postPdf({ title: 'Ohne Inhalt' });

    // Der Client unterscheidet Erfolg und Fehler am Content-Type; ein
    // Fehlerfall darf niemals als PDF durchgehen.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('content-type')).not.toContain('application/pdf');
    // Bestandsverhalten, unverändert durch den Renderer-Tausch: die
    // Zod-Validierung des ts-rest-Routers endet im Express-Fehlerhandler und
    // liefert HTML, kein JSON. Der Mobile-Client fängt das ab (JSON.parse in
    // try/catch), deshalb hier festgehalten statt im selben PR umgebaut.
    expect(res.headers.get('content-type')).toContain('text/html');
  }, 60_000);
});
