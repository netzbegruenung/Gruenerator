/**
 * Sichtbarkeit und Lebenszyklus müssen zusammen wandern.
 *
 * Vorher schrieb der „Veröffentlichen"-Schalter nur `is_private` — die Vorlage
 * blieb ein `draft` und war damit weder in der Galerie (die `is_private=false`
 * UND `status='published'` verlangt) noch in der Prüf-Warteschlange sichtbar.
 * Deshalb prüft dieser Test den tatsächlich gesendeten Rumpf, nicht bloß, dass
 * der Aufruf durchläuft.
 *
 * `.tsx` trotz fehlendem JSX: nur die dom-Lane startet den MSW-Server
 * (vitest.setup.ts), die node-Lane würde echte Netzwerkaufrufe absetzen.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { profileApiService } from './profileApiService';

const URL = 'http://localhost/api/auth/user-templates/tpl-1';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

/** Captures the PUT body the client actually puts on the wire. */
function captureBody(): { current: Record<string, unknown> | null } {
  const captured: { current: Record<string, unknown> | null } = { current: null };
  server.use(
    http.put(URL, async ({ request }) => {
      captured.current = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        success: true,
        message: 'ok',
        data: {
          id: 'tpl-1',
          title: 'Vorlage',
          description: null,
          type: 'template',
          template_type: 'gruenerator',
          external_url: null,
          preview_image_url: null,
          images: [],
          categories: [],
          tags: [],
          content_data: {},
          metadata: {},
          is_private: true,
          status: 'draft',
          created_at: '2026-08-21T00:00:00.000Z',
          updated_at: '2026-08-21T00:00:00.000Z',
        },
      });
    })
  );
  return captured;
}

describe('profileApiService.updateTemplateVisibility', () => {
  it('reicht beim Veröffentlichen zur Prüfung ein', async () => {
    const captured = captureBody();

    await profileApiService.updateTemplateVisibility('tpl-1', false);

    expect(captured.current).toEqual({ is_private: false, status: 'pending_review' });
  });

  it('setzt beim Privatmachen zurück auf Entwurf', async () => {
    const captured = captureBody();

    await profileApiService.updateTemplateVisibility('tpl-1', true);

    expect(captured.current).toEqual({ is_private: true, status: 'draft' });
  });
});
