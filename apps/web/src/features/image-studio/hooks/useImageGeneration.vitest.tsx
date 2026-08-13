/**
 * Der Regressionstest zum gemeldeten Fehler.
 *
 * Am 13.08.2026 brach `/studio/templates/info` bei jeder Eingabe mit
 * „Unerwartete Antwortstruktur von der API" ab: der Hook las `response.header`,
 * der Draht nestet unter `mainInfo`. Slider war aus einem verwandten Grund
 * kaputt (der Antwort-Parser kannte `mainSlider` nicht). Beides läuft jetzt
 * über den ts-rest-Vertrag — hier gegen echte Drahtantworten geprüft.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useImageGeneration } from './useImageGeneration';

const BASE = 'http://localhost/api/sharepic/text';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

describe('useImageGeneration.generateText', () => {
  it('info: packt mainInfo aus', async () => {
    server.use(
      http.post(`${BASE}/info`, () =>
        HttpResponse.json({
          success: true,
          mainInfo: { header: 'Kopf', subheader: 'Unterkopf', body: 'Fliesstext.' },
          alternatives: [],
          searchTerms: ['klima'],
        })
      )
    );

    const { result } = renderHook(() => useImageGeneration());

    let out: Awaited<ReturnType<typeof result.current.generateText>> = null;
    await act(async () => {
      out = await result.current.generateText('info', { thema: 'Good News zum Wochenende' });
    });

    expect(out).toMatchObject({ header: 'Kopf', subheader: 'Unterkopf', body: 'Fliesstext.' });
    expect(result.current.error).toBe('');
  });

  it('slider: liefert Label, Headline und Subtext', async () => {
    server.use(
      http.post(`${BASE}/slider`, () =>
        HttpResponse.json({
          success: true,
          mainSlider: { label: 'Wusstest du?', headline: 'Kopf', subtext: 'Text', subtext2: '' },
          alternatives: [],
          searchTerms: [],
        })
      )
    );

    const { result } = renderHook(() => useImageGeneration());

    let out: Awaited<ReturnType<typeof result.current.generateText>> = null;
    await act(async () => {
      out = await result.current.generateText('slider', { thema: 'X' });
    });

    expect(out).toMatchObject({ label: 'Wusstest du?', headline: 'Kopf', subtext: 'Text' });
  });

  it('zitat: quote als String, Alternativen zu Objekten normalisiert', async () => {
    server.use(
      http.post(`${BASE}/zitat`, () =>
        HttpResponse.json({
          success: true,
          quote: 'Ein Zitat.',
          name: 'Annalena Beispiel',
          alternatives: ['Noch eins.'],
          searchTerms: [],
        })
      )
    );

    const { result } = renderHook(() => useImageGeneration());

    let out: Awaited<ReturnType<typeof result.current.generateText>> = null;
    await act(async () => {
      out = await result.current.generateText('zitat', { thema: 'X', name: 'Annalena Beispiel' });
    });

    expect(out).toMatchObject({ quote: 'Ein Zitat.', alternatives: [{ quote: 'Noch eins.' }] });
  });

  it('400: die Ablehnung des Modells landet wörtlich im Fehlerzustand', async () => {
    server.use(
      http.post(`${BASE}/zitat`, () =>
        HttpResponse.json(
          { success: false, error: 'Ablehnung: Erfundene Zitate sind nicht zulässig.' },
          { status: 400 }
        )
      )
    );

    const { result } = renderHook(() => useImageGeneration());

    await act(async () => {
      await expect(result.current.generateText('zitat', { thema: 'X' })).rejects.toThrow(
        'Ablehnung: Erfundene Zitate sind nicht zulässig.'
      );
    });

    expect(result.current.error).toBe('Ablehnung: Erfundene Zitate sind nicht zulässig.');
  });
});
