import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FlyerAnalysis, FlyerToSiteState } from '../types.js';

// ─── Module mocks ────────────────────────────────────────────

vi.mock('../../../../services/localization/index.js', () => ({
  extractLocaleFromRequest: () => 'de-DE' as const,
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

// Der Knoten geht über `aiText`, und das ruft `executeProvider` direkt — der
// Client in `req.app.locals` ist auf diesem Pfad nicht mehr beteiligt.
const executeProvider = vi.fn();
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { generateNode } = await import('./generateNode.js');

// ─── Helpers ─────────────────────────────────────────────────

/** Das Modell antwortet mit `content`. */
function answering(content: string) {
  executeProvider.mockReset();
  executeProvider.mockResolvedValue({ success: true, content, stop_reason: 'stop' });
  return executeProvider;
}

/** Der Envelope, den der erste Provider-Aufruf bekam — `(provider, id, data)`. */
function envelope(provider: typeof executeProvider) {
  return provider.mock.calls[0][2] as {
    systemPrompt: string;
    messages: Array<{ content: string }>;
  };
}

const validWebsiteContent = {
  hero: { heading: 'Hallo!', text: 'Willkommen' },
  about: { title: 'Über mich', content: 'Bio text' },
  hero_image: { title: 'Slogan', subtitle: 'Subtitle' },
  themes: [
    { title: 'Klimaschutz', content: 'Beschreibung' },
    { title: 'Bildung', content: 'Beschreibung' },
    { title: 'Mobilität', content: 'Beschreibung' },
  ],
  actions: [
    { text: 'Mitmachen', link: '#kontakt' },
    { text: 'Spenden', link: '#spenden' },
  ],
  contact: { title: 'Kontakt', email: 'test@example.de' },
};

const defaultAnalysis: FlyerAnalysis = {
  name: 'Maria Müller',
  politicalRole: 'Stadträtin',
  region: 'Musterstadt',
  themes: ['Klimaschutz', 'Bildung'],
  slogans: ['Gemeinsam für morgen'],
  contactInfo: { email: 'maria@example.de' },
  keyMessages: ['Nachhaltigkeit first'],
  rawDescription: 'Ich bin Maria Müller, Stadträtin in Musterstadt.',
};

function makeState(overrides: Partial<FlyerToSiteState> = {}): FlyerToSiteState {
  return {
    pdfBuffer: Buffer.from(''),
    originalFilename: 'flyer.pdf',
    email: 'fallback@example.de',
    req: { app: { locals: {} }, headers: {} },
    extractedText: 'Some text',
    extractionResult: null,
    extractTimeMs: 100,
    flyerAnalysis: defaultAnalysis,
    analyzeTimeMs: 200,
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

describe('generateNode', () => {
  beforeEach(() => {
    answering(JSON.stringify(validWebsiteContent));
  });

  it('returns error when flyerAnalysis is null', async () => {
    const result = await generateNode(makeState({ flyerAnalysis: null }));

    expect(result.websiteContent).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('generates valid WebsiteContent from analysis', async () => {
    const result = await generateNode(makeState());

    expect(result.websiteContent).toBeDefined();
    expect(result.websiteContent!.hero.heading).toBe('Hallo!');
    expect(result.websiteContent!.themes).toHaveLength(3);
    expect(result.websiteContent!.actions).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  it('strips markdown code blocks from AI response', async () => {
    answering('```json\n' + JSON.stringify(validWebsiteContent) + '\n```');
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent).toBeDefined();
    expect(result.websiteContent!.hero.heading).toBe('Hallo!');
  });

  it('truncates themes to max 3', async () => {
    const contentWith5Themes = {
      ...validWebsiteContent,
      themes: [
        { title: 'A', content: 'a' },
        { title: 'B', content: 'b' },
        { title: 'C', content: 'c' },
        { title: 'D', content: 'd' },
        { title: 'E', content: 'e' },
      ],
    };

    answering(JSON.stringify(contentWith5Themes));
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent!.themes).toHaveLength(3);
  });

  it('truncates actions to max 3', async () => {
    const contentWith4Actions = {
      ...validWebsiteContent,
      actions: [
        { text: 'A', link: '#a' },
        { text: 'B', link: '#b' },
        { text: 'C', link: '#c' },
        { text: 'D', link: '#d' },
      ],
    };

    answering(JSON.stringify(contentWith4Actions));
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent!.actions).toHaveLength(3);
  });

  it('errors when AI returns invalid JSON', async () => {
    answering('not json');
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent).toBeNull();
    expect(result.error).toContain('kein valides JSON');
  });

  it('errors when required fields are missing', async () => {
    const incomplete = { hero: { heading: 'Hi', text: 'Yo' } };

    answering(JSON.stringify(incomplete));
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent).toBeNull();
    expect(result.error).toContain('Fehlendes Feld');
  });

  it('errors when themes array is empty', async () => {
    const noThemes = { ...validWebsiteContent, themes: [] };

    answering(JSON.stringify(noThemes));
    const state = makeState();

    const result = await generateNode(state);
    expect(result.websiteContent).toBeNull();
    expect(result.error).toContain('themes-Array');
  });

  it('uses contactInfo email over state email', async () => {
    const provider = answering(JSON.stringify(validWebsiteContent));
    const state = makeState({
      email: 'state@example.de',
      flyerAnalysis: {
        ...defaultAnalysis,
        contactInfo: { email: 'flyer@example.de' },
      },
    });

    await generateNode(state);

    expect(envelope(provider).systemPrompt).toContain('flyer@example.de');
  });

  it('falls back to state email when contactInfo has no email', async () => {
    const provider = answering(JSON.stringify(validWebsiteContent));
    const state = makeState({
      email: 'state@example.de',
      flyerAnalysis: {
        ...defaultAnalysis,
        contactInfo: {},
      },
    });

    await generateNode(state);

    expect(envelope(provider).systemPrompt).toContain('state@example.de');
  });

  it('includes themes and slogans in user prompt', async () => {
    const provider = answering(JSON.stringify(validWebsiteContent));

    await generateNode(makeState());

    const userMessage = envelope(provider).messages[0].content;
    expect(userMessage).toContain('Klimaschutz');
    expect(userMessage).toContain('Bildung');
    expect(userMessage).toContain('Gemeinsam für morgen');
  });

  it('records generateTimeMs', async () => {
    const result = await generateNode(makeState());
    expect(result.generateTimeMs).toBeGreaterThanOrEqual(0);
  });
});
