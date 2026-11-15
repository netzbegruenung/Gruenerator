import { describe, expect, it } from 'vitest';

import { HttpStatusError } from '../../base/BaseScraper.js';
import { PoliteGate, type Fetcher } from '../../parliament/index.js';

import { AntragsgruenClient, NotPublicError, type ConsultationRef } from './antragsgruenClient.js';
import { ANTRAGSGRUEN_INSTANCES } from '../../../../config/antragsgruenInstances.js';

const HOST = 'https://gruene-nrw.antragsgruen.de';
const ref: ConsultationRef = {
  title: 'LDK',
  title_short: 'LDK',
  date_published: '2026-08-20T09:00:00+02:00',
  url_path: 'ldk26-02',
  url_json: `${HOST}/rest/ldk26-02`,
  url_html: `${HOST}/ldk26-02`,
};

const json = (body: unknown, url: string): Response => {
  const res = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
  Object.defineProperty(res, 'url', { value: url });
  return res;
};

const clientWith = (fetcher: Fetcher) =>
  new AntragsgruenClient(ANTRAGSGRUEN_INSTANCES[0], new PoliteGate(0), fetcher);

describe('AntragsgruenClient', () => {
  it('liest Satzungsänderungen, die als Änderungsantrag direkt in motion_links stehen', async () => {
    // Gekürzt aus der LDK Essen 2026 (15.11.2026): Anträge und Satzungs-ÄAs gemischt.
    const body = {
      title: 'LDK',
      title_short: 'LDK',
      motion_links: [
        {
          type: 'motion',
          id: 1,
          agenda_item: 'Programm',
          prefix: 'WP-01',
          title: 'Kapitel',
          title_with_prefix: 'WP-01: Kapitel',
          status_id: 3,
          status_title: 'Eingereicht',
          initiators_html: 'Landesvorstand',
          amendment_links: [],
          url_json: `${HOST}/rest/ldk26-02/motion/kapitel-1`,
          url_html: `${HOST}/ldk26-02/kapitel-1`,
        },
        {
          type: 'amendment',
          id: 108630,
          agenda_item: 'Satzungen und Statute',
          prefix: 'FO-01',
          title: 'FO-01: Finanzordnung',
          title_with_prefix: 'FO-01: Finanzordnung',
          status_id: 3,
          status_title: '<span class="screened">Geprüft</span>',
          initiators_html: 'Landesvorstand GRÜNE NRW',
          amendment_links: [],
          url_json: `${HOST}/rest/ldk26-02/motion/finanzordnung-31341/amendment/108630`,
          url_html: `${HOST}/ldk26-02/finanzordnung-31341/108630`,
        },
      ],
    };
    const consultation = await clientWith((url) => Promise.resolve(json(body, url))).consultation(
      ref
    );
    expect(consultation.motion_links.map((l) => l.type)).toEqual(['motion', 'amendment']);
  });

  it('erkennt eine geschlossene Konsultation an der Umleitung auf den Login', async () => {
    const login = new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(login, 'url', { value: `${HOST}/login?backUrl=%2Frest%2Fldr16` });
    await expect(clientWith(() => Promise.resolve(login)).consultation(ref)).rejects.toBeInstanceOf(
      NotPublicError
    );
  });

  it('liest „Public API disabled" (403) als nicht öffentlich', async () => {
    await expect(
      clientWith(() => Promise.reject(new HttpStatusError(403))).listConsultations()
    ).rejects.toBeInstanceOf(NotPublicError);
  });

  it('fragt keinen fremden Host an, auch wenn eine Antwort auf ihn zeigt', async () => {
    const calls: string[] = [];
    const client = clientWith((url) => {
      calls.push(url);
      return Promise.resolve(json({}, url));
    });
    await expect(
      client.consultation({ ...ref, url_json: 'https://example.org/rest/x' })
    ).rejects.toThrow('foreign host');
    expect(calls).toEqual([]);
  });
});
