import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateSharepicForChat = vi.fn();

vi.mock('../../../services/chat/sharepicGenerationService.js', () => ({
  generateSharepicForChat: (...args: unknown[]) => generateSharepicForChat(...args),
}));

const { generateSharepicVariants } = await import('./sharepicVariantHelpers.js');

const req = {} as Parameters<typeof generateSharepicVariants>[0]['req'];

/** Antwortform des Generators — nur die Felder, die toVariant liest. */
const ok = (sharepic: Record<string, unknown>) => ({
  success: true,
  content: { sharepic },
});

/**
 * Nur noch die Überarbeitung alter Vorlagen-Sharepics läuft über
 * `generateSharepicVariants`; sie hält das Sujet und bildet die Felder je
 * Locale ab.
 */
describe('Überarbeitung alter Sharepics für de-AT', () => {
  beforeEach(() => {
    generateSharepicForChat.mockReset();
  });

  it('füllt das Info-Sujet aus den AT-Feldern, nicht aus header/body', async () => {
    generateSharepicForChat.mockResolvedValue(
      ok({
        type: 'info',
        introline: 'Österreichs Strommix',
        infoText: '87 Prozent kommen bereits aus Erneuerbaren',
        accent: 'unabhängig.',
      })
    );
    const { variants } = await generateSharepicVariants({
      req,
      userLocale: 'de-AT',
      refinement: {
        instruction: 'kürzer',
        prior: { variantId: 'v1', canvasId: null, canvasType: 'info-at', props: {} },
      },
    });
    expect(variants[0]?.canvasType).toBe('info-at');
    expect(variants[0]?.initialProps).toEqual({
      introline: 'Österreichs Strommix',
      text: '87 Prozent kommen bereits aus Erneuerbaren',
      accent: 'unabhängig.',
    });
  });

  it('gibt dem Overlay-Sujet Foto und Subline mit', async () => {
    generateSharepicForChat.mockResolvedValue(
      ok({
        type: 'dreizeilen',
        mainSlogan: {
          line1: 'Mehr Windkraft',
          line2: 'für Österreich',
          line3: 'und für uns',
          subline: 'Ausbau bis 2030',
        },
        selectedImage: 'wind.jpg',
      })
    );
    const { variants } = await generateSharepicVariants({
      req,
      userLocale: 'de-AT',
      refinement: {
        instruction: 'kürzer',
        prior: {
          variantId: 'v1',
          canvasId: null,
          canvasType: 'dreizeilen-overlay-at',
          props: {},
        },
      },
    });
    const props = variants[0]?.initialProps as Record<string, unknown>;
    expect(props.accent).toBe('für Österreich');
    expect(props.subline).toBe('Ausbau bis 2030');
    // Ohne das Foto wäre die Bildsuche des Generators umsonst gelaufen.
    expect(props.currentImageSrc).toContain('wind.jpg');
  });

  it('hält eine Verfeinerung auf ihrem Sujet', async () => {
    // Ein im Studio erzeugtes Zitat-Pur darf beim „kürzer" nicht zum
    // fotohinterlegten Zitat werden — verlangt war eine Textänderung, kein
    // Layoutwechsel.
    generateSharepicForChat.mockResolvedValue(
      ok({ type: 'zitat_pure', quote: 'Kürzer', name: 'Wer' })
    );
    const { variants } = await generateSharepicVariants({
      req,
      userLocale: 'de-AT',
      refinement: {
        instruction: 'kürzer',
        prior: {
          variantId: 'v1',
          canvasId: null,
          canvasType: 'zitat-pure-at',
          props: { quote: 'Ein Zitat', name: 'Wer' },
        },
      },
    });
    expect(variants[0]?.canvasType).toBe('zitat-pure-at');
  });
});
