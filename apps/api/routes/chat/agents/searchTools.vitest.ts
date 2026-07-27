import { describe, it, expect } from 'vitest';

import { createSearchTools } from './searchTools.js';

import type { AgentConfig } from './types.js';

/**
 * Austria is a first-class audience, not a toggle on a German default. Live
 * failure: an AT user asked who the Austrian chancellor is, the planner named
 * no collection, and `gruenerator_search` ran against `deutschland` /
 * `grundsatz_documents` — 0 results, and the turn answered without grounding.
 */
const AGENT = {
  identifier: 'gruenerator-universal',
  provider: 'mistral',
  model: 'mistral-medium-2604',
  params: {},
} as unknown as AgentConfig;

/** The collection the tool falls back to when the model names none. */
function defaultCollection(tools: ReturnType<typeof createSearchTools>): unknown {
  const schema = (tools.gruenerator_search as { inputSchema: { parse: (v: unknown) => unknown } })
    .inputSchema;
  return (schema.parse({ query: 'test' }) as { collection?: unknown }).collection;
}

describe('createSearchTools — locale-aware default collection', () => {
  it('defaults an Austrian user to the Austrian collection', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'de-AT' }))).toBe(
      'oesterreich'
    );
  });

  it('defaults a German user to the German collection', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'de-DE' }))).toBe(
      'deutschland'
    );
  });

  it('keeps the previous behaviour when no locale is passed', () => {
    expect(defaultCollection(createSearchTools(AGENT))).toBe('deutschland');
  });

  it('lets an explicit agent restriction win over the locale', () => {
    // A deliberate per-agent decision must not be overridden by who is asking.
    const restricted = {
      ...AGENT,
      toolRestrictions: {
        allowedCollections: ['deutschland', 'oesterreich'],
        defaultCollection: 'deutschland',
      },
    } as unknown as AgentConfig;
    expect(defaultCollection(createSearchTools(restricted, { userLocale: 'de-AT' }))).toBe(
      'deutschland'
    );
  });

  it('falls back when the locale collection is not allowed for this agent', () => {
    const deOnly = {
      ...AGENT,
      toolRestrictions: { allowedCollections: ['deutschland', 'bundestagsfraktion'] },
    } as unknown as AgentConfig;
    expect(defaultCollection(createSearchTools(deOnly, { userLocale: 'de-AT' }))).toBe(
      'deutschland'
    );
  });

  it('ignores an unknown locale', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'en-US' }))).toBe(
      'deutschland'
    );
  });
});
