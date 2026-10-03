import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateSliderDeckForChat = vi.fn();
const createCanvas = vi.fn();
const query = vi.fn();

vi.mock('../../../services/chat/sliderGenerationService.js', () => ({
  generateSliderDeckForChat: (...args: unknown[]) => generateSliderDeckForChat(...args),
}));
vi.mock('../../../services/canvas/canvasRepository.js', () => ({
  createCanvas: (...args: unknown[]) => createCanvas(...args),
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  applyDeckChanges: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: vi.fn(),
}));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { generateSliderDeckVariant } = await import('./sliderDeckService.js');

const req = {} as Parameters<typeof generateSliderDeckVariant>[0]['req'];

const slides = [
  { label: 'Wusstest du?', headline: 'Cover', subtext: 'Sub', subtext2: '' },
  { label: '', headline: 'Fakt', subtext: 'Inhalt', subtext2: 'Quelle' },
  { label: '', headline: 'Mehr dazu', subtext: 'gruene.at', subtext2: '' },
];

/**
 * Ein Karussell aus dem Chat war für Österreich immer das deutsche Design
 * (#4074): der Deck-Pfad kannte nur `slider`.
 */
describe('generateSliderDeckVariant', () => {
  beforeEach(() => {
    generateSliderDeckForChat.mockReset().mockResolvedValue({ slides });
    createCanvas.mockReset().mockResolvedValue({ id: 'canvas-1' });
    query.mockReset().mockResolvedValue({ rows: [] });
  });

  it('mints the Austrian deck for de-AT', async () => {
    const variant = await generateSliderDeckVariant({
      req,
      text: 'Windkraft',
      threadId: 'thread-1',
      userId: 'user-1',
      userLocale: 'de-AT',
    });

    expect(variant.canvasType).toBe('slider-at');
    expect(createCanvas.mock.calls[0][1]).toMatchObject({ template_type: 'slider-at' });
    expect(query.mock.calls[0][1]).toContain('slider-at');

    const pages = createCanvas.mock.calls[0][1].initial_state.pages as {
      configId: string;
      state: Record<string, unknown>;
    }[];
    expect(pages.map((p) => p.configId)).toEqual(['slider-at', 'slider-at', 'slider-at']);
    expect(pages[0].state).toMatchObject({
      colorScheme: 'dunkelgruen',
      backgroundColor: '#257639',
    });
  });

  it('keeps the German deck for everyone else', async () => {
    for (const userLocale of ['de-DE', null]) {
      createCanvas.mockClear();
      const variant = await generateSliderDeckVariant({
        req,
        text: 'Windkraft',
        threadId: null,
        userId: 'user-1',
        userLocale,
      });

      expect(variant.canvasType).toBe('slider');
      const pages = createCanvas.mock.calls[0][1].initial_state.pages as {
        configId: string;
        state: Record<string, unknown>;
      }[];
      expect(pages.every((p) => p.configId === 'slider')).toBe(true);
      expect(pages[0].state).toMatchObject({
        colorScheme: 'sand-tanne',
        backgroundColor: '#F5F1E9',
      });
    }
  });
});
