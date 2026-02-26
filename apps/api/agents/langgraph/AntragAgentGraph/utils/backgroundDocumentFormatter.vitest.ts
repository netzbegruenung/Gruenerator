import { describe, expect, it, vi } from 'vitest';

import type { ArgumentResult } from '../../PRAgent/generators/argumentsGenerator.js';
import type { AntragAgentState } from '../types.js';

// Mock the logger
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock formatSourcesBibliography
vi.mock('../../PRAgent/utils/responseFormatter.js', () => ({
  formatSourcesBibliography: vi.fn(() => ''),
}));

import { assembleBackgroundDocument } from './backgroundDocumentFormatter.js';

function makeArg(overrides: Partial<ArgumentResult> = {}): ArgumentResult {
  return {
    source: 'Grundsatzprogramm Kapitel 3',
    text: 'Artenschutz ist ein zentrales Anliegen grüner Politik.',
    relevance: 0.87,
    metadata: {
      collection: 'grundsatz_documents',
      url: 'https://example.com/grundsatz',
    },
    ...overrides,
  };
}

function makeState(overrides: Partial<AntragAgentState> = {}): AntragAgentState {
  return {
    inhalt: 'Mehr Artenschutz in Alfter',
    requestType: 'antrag',
    gliederung: 'OV Alfter',
    features: {
      useWebSearchTool: false,
      usePrivacyMode: false,
      useProMode: false,
      useUltraMode: false,
    },
    selectedDocumentIds: [],
    selectedTextIds: [],
    attachments: [],
    searchQuery: 'artenschutz alfter',
    req: {},
    enrichedState: null,
    arguments: [],
    argumentsSummary: null,
    researchContext: null,
    strategy: null,
    generatedContent: '',
    formattedOutput: '',
    backgroundDocument: '',
    startTime: Date.now(),
    researchTimeMs: 0,
    strategyTimeMs: 0,
    generationTimeMs: 0,
    error: null,
    ...overrides,
  };
}

describe('assembleBackgroundDocument', () => {
  it('returns empty string when no research data beyond title exists', () => {
    // Title + inhalt + gliederung = 3 sections, but no research data
    // The guard checks sections.length <= 2, so with inhalt+gliederung it returns content.
    // With minimal state (no inhalt/gliederung) it should be empty.
    const result = assembleBackgroundDocument(makeState({ inhalt: '', gliederung: '' }));
    expect(result).toBe('');
  });

  it('includes title and strategy', () => {
    const result = assembleBackgroundDocument(
      makeState({
        strategy: 'Fokus auf kommunale Biodiversität',
        argumentsSummary: 'Zusammenfassung der Positionen',
        arguments: [makeArg()],
      })
    );
    expect(result).toContain('# Hintergrundpapier: Antrag');
    expect(result).toContain('**Thema:** Mehr Artenschutz in Alfter');
    expect(result).toContain('**Gremium:** OV Alfter');
    expect(result).toContain('## Argumentationsstrategie');
    expect(result).toContain('Fokus auf kommunale Biodiversität');
  });

  it('includes argument details: relevance, collection, excerpt', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        arguments: [makeArg()],
      })
    );

    expect(result).toContain('87%');
    expect(result).toContain('Grundsatzprogramm');
    expect(result).toContain('Artenschutz ist ein zentrales Anliegen');
    expect(result).toContain('https://example.com/grundsatz');
  });

  it('shows fallback text for arguments with empty text', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        arguments: [makeArg({ text: '' })],
      })
    );

    expect(result).toContain('*(Kein Textauszug verfügbar)*');
  });

  it('groups consecutive arguments from same source', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        arguments: [
          makeArg({ source: 'Grundsatzprogramm', relevance: 0.9 }),
          makeArg({ source: 'Grundsatzprogramm', relevance: 0.7 }),
          makeArg({ source: 'KommunalWiki', relevance: 0.6 }),
        ],
      })
    );

    expect(result).toContain('### 1–2. Grundsatzprogramm');
    expect(result).toContain('*2 Treffer aus dieser Quelle:*');
    expect(result).toContain('**Treffer 1:**');
    expect(result).toContain('**Treffer 2:**');
    expect(result).toContain('### 3. KommunalWiki');
  });

  it('generates fallback sources when enrichment metadata is null', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        enrichedState: null,
        arguments: [
          makeArg({ source: 'Grundsatzprogramm Kapitel 3' }),
          makeArg({
            source: 'KommunalWiki: Artenschutz',
            metadata: { collection: 'kommunalwiki_documents', url: 'https://example.com/wiki' },
          }),
        ],
      })
    );

    expect(result).toContain('# Verwendete Quellen');
    expect(result).toContain('**Grundsatzprogramm Kapitel 3**');
    expect(result).toContain('**KommunalWiki: Artenschutz**');
  });

  it('generates fallback sources when enrichment metadata is empty object', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        enrichedState: {
          enrichmentMetadata: {},
        } as any,
        arguments: [makeArg()],
      })
    );

    // formatSourcesBibliography is mocked to return '' (empty),
    // so the fallback should trigger
    expect(result).toContain('# Verwendete Quellen');
  });

  it('deduplicates fallback sources by URL', () => {
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        arguments: [
          makeArg({
            source: 'Same Doc',
            metadata: { collection: 'grundsatz_documents', url: 'https://same.url' },
          }),
          makeArg({
            source: 'Same Doc',
            metadata: { collection: 'grundsatz_documents', url: 'https://same.url' },
          }),
        ],
      })
    );

    // Once in arguments section (grouped), once in sources — not duplicated in sources
    const sourceSection = result.split('# Verwendete Quellen')[1] || '';
    const sourceMatches = sourceSection.match(/\*\*Same Doc\*\*/g);
    expect(sourceMatches).toHaveLength(1);
  });

  it('truncates long excerpts to 300 chars', () => {
    const longText = 'A'.repeat(500);
    const result = assembleBackgroundDocument(
      makeState({
        argumentsSummary: 'Zusammenfassung',
        arguments: [makeArg({ text: longText })],
      })
    );

    expect(result).toContain('A'.repeat(300) + '...');
    expect(result).not.toContain('A'.repeat(301));
  });
});
