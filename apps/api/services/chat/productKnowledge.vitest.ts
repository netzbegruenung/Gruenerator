import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCompactProductIdentity,
  buildProductKnowledgeBlock,
  isMcpMetaQuestion,
  isProductMetaQuestion,
} from './productKnowledge.js';

vi.mock('../mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: {
    list: vi.fn().mockResolvedValue([
      {
        id: '1',
        name: 'Mein Testserver',
        url: 'https://example.org/mcp',
        authType: 'none',
        hasToken: false,
        enabled: true,
        createdAt: '',
        updatedAt: '',
        toolNames: ['search', 'fetch'],
      },
    ]),
  },
}));

const ENV_KEYS = [
  'SYSTEM_MCP_DB_URL',
  'SYSTEM_MCP_WEATHER_URL',
  'SYSTEM_MCP_ARD_URL',
  'SYSTEM_MCP_TRIVAGO_URL',
];

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('isProductMetaQuestion', () => {
  it.each([
    'welche mcp server kennst du',
    'Welche MCP-Server kennst du?',
    'was kannst du?',
    'Was kannst du denn alles',
    'was kannst du alles für mich machen?',
    'was kannst du für mich tun?',
    'ist mein eigener mcp schon verbunden?',
    'wie erstelle ich ein sharepic',
    'welche funktionen hat der grünerator',
    'wobei kannst du mir helfen?',
    'was ist der grünerator',
    'wie funktioniert der grünerator?',
  ])('matches "%s"', (q) => {
    expect(isProductMetaQuestion(q)).toBe(true);
  });

  it.each([
    'was kannst du mir über die wärmewende sagen',
    'welche hebel hat eine kommune beim klimaschutz',
    'schreibe einen antrag zu radwegen',
    'wie erstelle ich einen antrag für die fraktion',
    'Erstelle mit dem Grünerator einen Antrag und erkläre die Funktion des Gesetzes.',
    'hallo, wie geht es dir',
  ])('does NOT match "%s"', (q) => {
    expect(isProductMetaQuestion(q)).toBe(false);
  });

  it('ignores long pasted texts even when they contain trigger phrases', () => {
    const longText = `was kannst du ${'Lorem ipsum dolor sit amet. '.repeat(30)}`;
    expect(isProductMetaQuestion(longText)).toBe(false);
  });
});

describe('isMcpMetaQuestion', () => {
  it.each([
    'welche mcp server kennst du',
    'kann ich einen eigenen server per mcp anbinden',
    'ist mein mcp schon verbunden?',
  ])('matches "%s"', (q) => {
    expect(isMcpMetaQuestion(q)).toBe(true);
  });

  it('ignores non-MCP questions', () => {
    expect(isMcpMetaQuestion('was kannst du?')).toBe(false);
    expect(isMcpMetaQuestion('welche server nutzt die verwaltung')).toBe(false);
  });
});

describe('buildCompactProductIdentity', () => {
  it('frames the party per locale via localizePlaceholders', () => {
    expect(buildCompactProductIdentity('de-DE')).toContain('von Bündnis 90/Die Grünen');
    expect(buildCompactProductIdentity('de-AT')).toContain('Die Grüne Alternative');
  });
});

describe('buildProductKnowledgeBlock', () => {
  it('lists agents, tools and collections; excludes dormant collections', async () => {
    const block = await buildProductKnowledgeBlock({
      locale: 'de-DE',
      userId: null,
      question: 'was kannst du?',
    });
    expect(block).toContain('### Grüneratoren');
    expect(block).toContain('### Werkzeuge');
    expect(block).toContain('Sharepics');
    expect(block).toContain('mcp.gruenerator.eu');
    expect(block).not.toContain('Satzungen');
  });

  it('shows env-active system MCP sources only', async () => {
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://weather.example';
    const block = await buildProductKnowledgeBlock({
      locale: 'de-DE',
      userId: null,
      question: 'was kannst du?',
    });
    expect(block).toContain('Wetter (DWD)');
    expect(block).not.toContain('Deutsche Bahn:');
  });

  it('marks DE-only sources for de-AT users', async () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://bahn.example';
    const block = await buildProductKnowledgeBlock({
      locale: 'de-AT',
      userId: null,
      question: 'was kannst du?',
    });
    expect(block).toContain('Daten nur für Deutschland');
  });

  it('includes connected servers only for MCP-flavoured questions with a user', async () => {
    const withMcp = await buildProductKnowledgeBlock({
      locale: 'de-DE',
      userId: 'u1',
      question: 'welche mcp server kennst du',
    });
    expect(withMcp).toContain('Mein Testserver');

    const withoutMcp = await buildProductKnowledgeBlock({
      locale: 'de-DE',
      userId: 'u1',
      question: 'was kannst du?',
    });
    expect(withoutMcp).not.toContain('Mein Testserver');

    const withoutUser = await buildProductKnowledgeBlock({
      locale: 'de-DE',
      userId: null,
      question: 'welche mcp server kennst du',
    });
    expect(withoutUser).not.toContain('Mein Testserver');
  });
});
