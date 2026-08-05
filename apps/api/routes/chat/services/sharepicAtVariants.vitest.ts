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
 * Der Chat schlägt drei Sharepics vor. Für Österreich wurde `info` früher durch
 * `dreizeilen` ersetzt und das Duplikat entfernt — übrig blieben zwei
 * Vorschläge. Diese Tests halten die Trias und die Zuordnung der Sujets fest.
 */
describe('Sharepic-Varianten für de-AT', () => {
  beforeEach(() => {
    generateSharepicForChat.mockReset();
    generateSharepicForChat.mockImplementation((_req: unknown, type: string) => {
      if (type === 'info') {
        return Promise.resolve(
          ok({
            type: 'info',
            introline: 'Österreichs Strommix',
            infoText: '87 Prozent kommen bereits aus Erneuerbaren',
            accent: 'unabhängig.',
          })
        );
      }
      if (type === 'zitat') {
        return Promise.resolve(ok({ type: 'zitat_pure', quote: 'Ein Zitat', name: 'Wer' }));
      }
      return Promise.resolve(
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
    });
  });

  it('erzeugt drei Sujets statt zweier', async () => {
    const { variants } = await generateSharepicVariants({
      req,
      text: 'Windkraft',
      userLocale: 'de-AT',
    });
    expect(variants.map((v) => v.canvasType)).toEqual([
      'dreizeilen-overlay-at',
      'zitat-pure-at',
      'info-at',
    ]);
  });

  it('lässt die deutsche Trias unverändert', async () => {
    const { variants } = await generateSharepicVariants({ req, text: 'Windkraft' });
    expect(variants.map((v) => v.canvasType)).toEqual(['dreizeilen', 'zitat-pure', 'info']);
  });

  it('füllt das Info-Sujet aus den AT-Feldern, nicht aus header/body', async () => {
    const { variants } = await generateSharepicVariants({
      req,
      text: 'Strommix',
      preferredVariant: 'info',
      userLocale: 'de-AT',
    });
    expect(variants[0]?.initialProps).toEqual({
      introline: 'Österreichs Strommix',
      text: '87 Prozent kommen bereits aus Erneuerbaren',
      accent: 'unabhängig.',
    });
  });

  it('gibt dem Overlay-Sujet Foto und Subline mit', async () => {
    const { variants } = await generateSharepicVariants({
      req,
      text: 'Windkraft',
      preferredVariant: 'dreizeilen',
      userLocale: 'de-AT',
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
    const { variants } = await generateSharepicVariants({
      req,
      text: 'kürzer',
      userLocale: 'de-AT',
      refinement: {
        instruction: 'kürzer',
        prior: {
          canvasType: 'zitat-pure-at',
          props: { quote: 'Ein Zitat', name: 'Wer' },
        },
      },
    });
    expect(variants[0]?.canvasType).toBe('zitat-pure-at');
  });
});
