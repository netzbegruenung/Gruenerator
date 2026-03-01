import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FlyerToSiteState } from '../types.js';

// ─── Module mocks ────────────────────────────────────────────

vi.mock('../../../../services/localization/index.js', () => ({
  extractLocaleFromRequest: () => 'de-DE',
  localizePlaceholders: (text: string) =>
    text.replace(/\{\{partyName\}\}/g, 'Bündnis 90/Die Grünen'),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { analyzeNode } = await import('./analyzeNode.js');

// ─── Helpers ─────────────────────────────────────────────────

function mockProcessRequest(content: string, success = true) {
  return vi.fn().mockResolvedValue({ success, content, error: success ? undefined : content });
}

function makeState(overrides: Partial<FlyerToSiteState> = {}): FlyerToSiteState {
  return {
    pdfBuffer: Buffer.from(''),
    originalFilename: 'flyer.pdf',
    email: '',
    req: {
      app: { locals: { aiWorkerPool: { processRequest: mockProcessRequest('') } } },
      headers: {},
    },
    extractedText: 'Maria Müller, Stadträtin. Klimaschutz und Bildung.',
    extractionResult: null,
    extractTimeMs: 0,
    flyerAnalysis: null,
    analyzeTimeMs: 0,
    websiteContent: null,
    generateTimeMs: 0,
    websiteContentWithImages: null,
    imageTimeMs: 0,
    startTime: Date.now(),
    error: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('analyzeNode', () => {
  it('returns null analysis and error when extractedText is null', async () => {
    const state = makeState({ extractedText: null });
    const result = await analyzeNode(state);

    expect(result.flyerAnalysis).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.analyzeTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('parses valid AI JSON response into FlyerAnalysis', async () => {
    const analysis = {
      name: 'Maria Müller',
      politicalRole: 'Stadträtin',
      region: 'Musterstadt',
      themes: ['Klimaschutz', 'Bildung'],
      slogans: ['Gemeinsam für morgen'],
      contactInfo: { email: 'maria@example.de' },
      keyMessages: ['Nachhaltigkeit first'],
      rawDescription: 'Ich bin Maria Müller, Stadträtin in Musterstadt.',
    };

    const state = makeState({
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest(JSON.stringify(analysis)),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);

    expect(result.flyerAnalysis).toBeDefined();
    expect(result.flyerAnalysis!.name).toBe('Maria Müller');
    expect(result.flyerAnalysis!.themes).toEqual(['Klimaschutz', 'Bildung']);
    expect(result.flyerAnalysis!.rawDescription).toBe(
      'Ich bin Maria Müller, Stadträtin in Musterstadt.'
    );
    expect(result.error).toBeUndefined();
  });

  it('handles AI response wrapped in markdown code blocks', async () => {
    const analysis = {
      name: 'Test',
      politicalRole: '',
      region: '',
      themes: [],
      slogans: [],
      contactInfo: {},
      keyMessages: [],
      rawDescription: 'Beschreibung',
    };

    const state = makeState({
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest('```json\n' + JSON.stringify(analysis) + '\n```'),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);
    expect(result.flyerAnalysis!.name).toBe('Test');
  });

  it('falls back to raw text when AI returns invalid JSON', async () => {
    const state = makeState({
      extractedText: 'Flyer text here',
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest('This is not valid JSON at all'),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);

    expect(result.flyerAnalysis).toBeDefined();
    expect(result.flyerAnalysis!.name).toBe('Unbekannt');
    expect(result.flyerAnalysis!.rawDescription).toBe('Flyer text here');
    expect(result.error).toBeUndefined();
  });

  it('falls back to raw text when AI request fails', async () => {
    const state = makeState({
      extractedText: 'Some flyer text',
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest('AI error', false),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);

    expect(result.flyerAnalysis!.name).toBe('Unbekannt');
    expect(result.flyerAnalysis!.rawDescription).toBe('Some flyer text');
  });

  it('uses extractedText as rawDescription when AI returns empty rawDescription', async () => {
    const analysis = {
      name: 'Test',
      politicalRole: '',
      region: '',
      themes: [],
      slogans: [],
      contactInfo: {},
      keyMessages: [],
      rawDescription: '',
    };

    const state = makeState({
      extractedText: 'Original OCR text',
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest(JSON.stringify(analysis)),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);
    expect(result.flyerAnalysis!.rawDescription).toBe('Original OCR text');
  });

  it('truncates very long extractedText in fallback to 2000 chars', async () => {
    const longText = 'a'.repeat(5000);
    const state = makeState({
      extractedText: longText,
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest('invalid', false),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);
    expect(result.flyerAnalysis!.rawDescription).toHaveLength(2000);
  });

  it('records analyzeTimeMs', async () => {
    const state = makeState({
      req: {
        app: {
          locals: {
            aiWorkerPool: {
              processRequest: mockProcessRequest(
                JSON.stringify({
                  name: 'X',
                  politicalRole: '',
                  region: '',
                  themes: [],
                  slogans: [],
                  contactInfo: {},
                  keyMessages: [],
                  rawDescription: 'desc',
                })
              ),
            },
          },
        },
        headers: {},
      },
    });

    const result = await analyzeNode(state);
    expect(result.analyzeTimeMs).toBeGreaterThanOrEqual(0);
  });
});
