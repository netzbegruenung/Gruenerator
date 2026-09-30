import { describe, it, expect, vi } from 'vitest';

import { NO_CAPABILITY_DENIAL_RULE, renderPriorLookups } from './artifactInventory.js';

import type { ChatGraphState } from '../types.js';

/**
 * #3931: „hast du vorhin in meinen Dokumenten nachgesehen?" bekam „Nein, in
 * diesem Turn habe ich nicht nachgesehen" — eine Karte unter der Suche von
 * eben. Der Schreiber kannte nur die Werkzeuge seines Turns, und die Regel gegen
 * „ich habe keine Werkzeuge" legte ihm genau diesen Satz hin.
 *
 * Geprüft am FERTIGEN Prompt: der Split-Schreiber erbt ihn als `systemMessage`,
 * also ist das der eine Ort, an dem beide Pfade die Liste sehen.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));
vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'direct',
    messages: [{ role: 'user', content: 'hast du vorhin in meinen Dokumenten nachgesehen?' }],
    searchResults: [],
    citations: [],
    agentConfig: { identifier: 'gruenerator-universal', systemRole: 'Du bist der Grünerator.' },
    enabledTools: {},
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    threadArtifacts: [],
    lastToolContext: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

const HEADING = 'FRÜHERE SUCHEN IN DIESEM GESPRÄCH';

describe('renderPriorLookups', () => {
  it('schweigt ohne frühere Suche', () => {
    expect(renderPriorLookups([])).toBe('');
  });

  it('nennt Begriff und Ausgang je Suche', () => {
    const block = renderPriorLookups([
      { toolName: 'find_content', query: 'Wärmepumpe', resultCount: 0, failed: false },
      { toolName: 'web_search', query: null, resultCount: null, failed: true },
      { toolName: 'scrape_url', query: 'https://example.org', resultCount: null, failed: false },
    ]);
    expect(block).toContain(HEADING);
    expect(block).toContain('- find_content „Wärmepumpe" — 0 Treffer');
    expect(block).toContain('- web_search — fehlgeschlagen');
    expect(block).toContain('- scrape_url „https://example.org" — ausgeführt');
  });

  it('die Regel gegen „keine Werkzeuge" verweist auf genau diese Überschrift', () => {
    // Sie steht im Split-Schreiber als letzter Absatz und überstimmt sonst den
    // Block (#3902) — der Verweis ist die Brücke, also muss er treffen.
    expect(NO_CAPABILITY_DENIAL_RULE).toContain(HEADING);
  });
});

describe('Systemprompt mit früheren Suchen (#3931)', () => {
  it('ein direkter Turn sieht die Suche des vorigen Turns', async () => {
    const prompt = await buildSystemMessage(
      state({
        threadLookups: [
          { toolName: 'find_content', query: 'Wärmepumpe', resultCount: 0, failed: false },
        ],
      })
    );
    expect(prompt).toContain(HEADING);
    expect(prompt).toContain('find_content „Wärmepumpe" — 0 Treffer');
  });

  it('ohne frühere Suche bleibt der Block weg', async () => {
    const prompt = await buildSystemMessage(state());
    expect(prompt).not.toContain(`## ${HEADING}`);
  });
});
