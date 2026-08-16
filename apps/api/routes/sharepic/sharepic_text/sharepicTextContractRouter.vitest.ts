/**
 * Der Router selbst: Statusabbildung, count-Klemmung, smartCount, und dass er
 * `userLocale`/`_campaignPrompt` nicht an den Handler durchreicht.
 *
 * `generateUnifiedTexts` ist gemockt — geprüft wird die Verdrahtung, nicht das
 * Modell.
 */
import { REFUSAL_ERROR_PREFIX } from '../../chat/services/refusalDetection.js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateUnifiedTexts = vi.fn();
const analyzeSlideCount = vi.fn();

vi.mock('./unifiedHandler.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./unifiedHandler.js')>();
  return { ...actual, generateUnifiedTexts };
});

vi.mock('./sliderSmartHandler.js', () => ({ analyzeSlideCount }));

const { sharepicTextContractRouter } = await import('./sharepicTextContractRouter.js');

// Der Router benutzt `req` nur, um an den AI-Pool zu kommen; für die
// Verdrahtungsfragen reicht ein Platzhalter.
const req = {} as never;

function success(mainKey: string, main: unknown) {
  return { success: true, mainKey, main, alternatives: [], searchTerms: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  analyzeSlideCount.mockResolvedValue(2);
});

describe('sharepicTextContractRouter', () => {
  it('reicht 200 mit der Drahtform durch', async () => {
    generateUnifiedTexts.mockResolvedValue(
      success('mainInfo', { header: 'Kopf', subheader: 'Sub', body: 'Text' })
    );

    const res = await sharepicTextContractRouter.generateInfo({
      req,
      body: { thema: 'Klimaschutz' },
    } as never);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, mainInfo: { header: 'Kopf' } });
  });

  it('gibt die Ablehnung des Modells als 400 weiter, unverändert', async () => {
    generateUnifiedTexts.mockResolvedValue({
      success: false,
      status: 400,
      error: `${REFUSAL_ERROR_PREFIX}Erfundene Zitate sind nicht zulässig.`,
    });

    const res = await sharepicTextContractRouter.generateZitat({
      req,
      body: { thema: 'X' },
    } as never);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: `${REFUSAL_ERROR_PREFIX}Erfundene Zitate sind nicht zulässig.`,
    });
  });

  it('reicht 500 nach erschöpften Versuchen weiter', async () => {
    generateUnifiedTexts.mockResolvedValue({
      success: false,
      status: 500,
      error: 'Failed after 2 attempts: Parse failed',
    });

    const res = await sharepicTextContractRouter.generateDreizeilen({
      req,
      body: { thema: 'X' },
    } as never);

    expect(res.status).toBe(500);
  });

  describe('count', () => {
    const cases: Array<[unknown, number]> = [
      [undefined, 1],
      [null, 1],
      [0, 1],
      [-3, 1],
      [5, 5],
      [999, 20],
    ];

    it.each(cases)('klemmt %s auf %i statt abzulehnen', async (input, expected) => {
      generateUnifiedTexts.mockResolvedValue(success('mainSimple', { headline: 'H', subtext: '' }));

      await sharepicTextContractRouter.generateSimple({
        req,
        body: { thema: 'X', count: input },
      } as never);

      expect(generateUnifiedTexts).toHaveBeenCalledWith(
        'simple',
        expect.objectContaining({ count: expected })
      );
    });
  });

  it('reicht userLocale und _campaignPrompt NICHT an den Handler weiter', async () => {
    generateUnifiedTexts.mockResolvedValue(
      success('mainInfo', { header: 'H', subheader: '', body: 'B' })
    );

    await sharepicTextContractRouter.generateInfo({
      req,
      body: { thema: 'X', userLocale: 'de-AT', _campaignPrompt: { systemRole: 'übernommen' } },
    } as never);

    const passed = generateUnifiedTexts.mock.calls[0][1] as Record<string, unknown>;
    // Sonst schaltete der Handler auf `info_at` um und antwortete mit
    // introline/text/accent — anderen Feldern, als der Vertrag als 200 zusagt.
    expect(passed).not.toHaveProperty('userLocale');
    expect(passed).not.toHaveProperty('_campaignPrompt');
  });

  describe('Österreich', () => {
    /**
     * Der Kern kennt zwei Wege zu den AT-Prompts: den Typ (das hier) und
     * `userLocale` (den In-Process-Pfad des Chats). Die Vertragsrouten gehen
     * ausschliesslich über den Typ — sonst hinge die Antwortform an einem Kopf
     * statt an der Route.
     */
    it.each([
      ['generateInfoAt', 'info_at', 'mainInfo', { introline: 'I', text: 'T', accent: 'A' }],
      [
        'generateDreizeilenAt',
        'dreizeilen_at',
        'mainSlogan',
        { line1: 'A', line2: 'B', line3: 'C', subline: 'S' },
      ],
    ] as const)('%s ruft den Kern mit %s auf', async (method, type, mainKey, main) => {
      generateUnifiedTexts.mockResolvedValue(success(mainKey, main));

      const res = await sharepicTextContractRouter[method]({
        req,
        body: { thema: 'Windkraft' },
      } as never);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, [mainKey]: main });

      const [passedType, passedBody] = generateUnifiedTexts.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(passedType).toBe(type);
      expect(passedBody).not.toHaveProperty('userLocale');
    });
  });

  describe('slider', () => {
    it('mit smartCount: Folienzahl aus der Analyse plus Cover und Abschluss', async () => {
      analyzeSlideCount.mockResolvedValue(3);
      generateUnifiedTexts.mockResolvedValue(
        success('mainSlider', { label: 'L', headline: 'H', subtext: 'S', subtext2: '' })
      );

      await sharepicTextContractRouter.generateSlider({
        req,
        body: { thema: 'Klimaschutz', smartCount: true },
      } as never);

      expect(analyzeSlideCount).toHaveBeenCalledWith('Klimaschutz', '');
      expect(generateUnifiedTexts).toHaveBeenCalledWith(
        'slider',
        expect.objectContaining({ count: 5 })
      );
    });

    it('ohne smartCount: keine Analyse-Anfrage', async () => {
      generateUnifiedTexts.mockResolvedValue(
        success('mainSlider', { label: 'L', headline: 'H', subtext: 'S', subtext2: '' })
      );

      await sharepicTextContractRouter.generateSlider({
        req,
        body: { thema: 'X', count: 4 },
      } as never);

      expect(analyzeSlideCount).not.toHaveBeenCalled();
      expect(generateUnifiedTexts).toHaveBeenCalledWith(
        'slider',
        expect.objectContaining({ count: 4 })
      );
    });
  });
});
