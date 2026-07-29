import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Welcher Canvas serverseitig rendert, hing an fest verdrahteten Routern: alle
 * AT-Sujets liefen durch ihr deutsches Gegenstück. In der Variantenliste des
 * Chats fällt das nicht auf, weil die Karten clientseitig rendern und
 * `sharepic.image` verwerfen — auf den übrigen Aufrufwegen von
 * `generateSharepicForChat` ist es genau das ausgelieferte Bild.
 *
 * Die Routen werden hier durch Attrappen ersetzt, die nur ihren Namen
 * hinterlassen. Geprüft wird also die Weiche, nicht das Bild.
 */
const gerufen: string[] = [];

/** Minimale Express-Router-Form, die getRouteHandler akzeptiert. */
const attrappe = (name: string) => ({
  default: {
    stack: [
      {
        route: {
          path: '/',
          methods: { post: true },
          stack: [
            {
              handle: (_req: unknown, res: { json: (p: unknown) => void }) => {
                gerufen.push(name);
                res.json({ image: 'data:image/png;base64,AA==' });
              },
            },
          ],
        },
      },
    ],
  },
});

// Pfade als Literale: vi.mock wird ueber die Konstanten hochgezogen.
vi.mock('../../routes/sharepic/sharepic_canvas/zitat_pure_canvas.js', () =>
  attrappe('zitat_pure:de')
);
vi.mock('../../routes/sharepic/sharepic_canvas/at/zitat_pure_at_canvas.js', () =>
  attrappe('zitat_pure:at')
);
vi.mock('../../routes/sharepic/sharepic_canvas/zitat_canvas.js', () => attrappe('zitat:de'));
vi.mock('../../routes/sharepic/sharepic_canvas/at/zitat_at_canvas.js', () => attrappe('zitat:at'));
vi.mock('../../routes/sharepic/sharepic_canvas/dreizeilen_canvas.js', () =>
  attrappe('dreizeilen:de')
);
vi.mock('../../routes/sharepic/sharepic_canvas/at/dreizeilen_overlay_at_canvas.js', () =>
  attrappe('dreizeilen:at')
);
vi.mock('../../routes/sharepic/sharepic_canvas/info_canvas.js', () => attrappe('info:de'));
vi.mock('../../routes/sharepic/sharepic_canvas/at/info_at_canvas.js', () => attrappe('info:at'));

/** Der Textpfad liefert je nach Typ das passende Nutzlast-Feld. */
vi.mock('../../routes/sharepic/sharepic_text/index.js', () => ({
  handleSharepicTextRequest: (
    _req: unknown,
    res: { json: (p: unknown) => void },
    type: string
  ): void => {
    const nutzlast: Record<string, unknown> = { success: true, alternatives: [] };
    if (type === 'zitat_pure' || type === 'zitat') {
      nutzlast.quote = 'Ein Zitat';
      nutzlast.name = 'Wer';
    } else if (type === 'dreizeilen') {
      nutzlast.mainSlogan = { line1: 'Mehr', line2: 'Wind', line3: 'jetzt' };
    } else {
      // Deutsch: header/subheader/body — Österreich: introline/text/accent.
      nutzlast.mainInfo = {
        header: 'H',
        subheader: 'S',
        body: 'B',
        introline: 'I',
        text: 'T',
        accent: 'A',
      };
    }
    res.json(nutzlast);
  },
}));

// Die KI-Bildauswahl des Dreizeilers wird nicht gebraucht — der Test schickt
// ein Bild mit, damit der Pfad ohne Netz und ohne Worker-Pool auskommt.
vi.mock('../../services/image/ImageSelectionService.js', () => ({
  default: { getImagePath: () => '/dev/null' },
}));

const { generateSharepicForChat } = await import('./sharepicGenerationService.js');

const req = {
  app: { locals: {} },
  headers: {},
} as unknown as Parameters<typeof generateSharepicForChat>[0];

/** Ein 1×1-PNG als hochgeladenes Bild — die Foto-Sujets verlangen eines. */
const bild = {
  type: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  name: 'p.png',
};

describe('Canvas-Weiche nach Locale', () => {
  beforeEach(() => {
    gerufen.length = 0;
  });

  const faelle = [
    { sujet: 'zitat_pure', mitBild: false },
    { sujet: 'zitat', mitBild: true },
    { sujet: 'dreizeilen', mitBild: true },
    { sujet: 'info', mitBild: false },
  ] as const;

  it.each(faelle)('$sujet: de-AT rendert durch den AT-Canvas', async ({ sujet, mitBild }) => {
    await generateSharepicForChat(req, sujet, {
      text: 'Windkraft',
      userLocale: 'de-AT',
      ...(mitBild && { attachments: [bild] }),
    });
    expect(gerufen).toEqual([`${sujet}:at`]);
  });

  it.each(faelle)(
    '$sujet: ohne Locale bleibt es der deutsche Canvas',
    async ({ sujet, mitBild }) => {
      await generateSharepicForChat(req, sujet, {
        text: 'Windkraft',
        ...(mitBild && { attachments: [bild] }),
      });
      expect(gerufen).toEqual([`${sujet}:de`]);
    }
  );
});
