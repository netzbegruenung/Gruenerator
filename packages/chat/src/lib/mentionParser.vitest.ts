/**
 * Tests for mentionParser — unresolvedMentions tracking
 */

import { parseMentionTokens } from '@gruenerator/shared/utils';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  documentMentionables,
  filterMentionables,
  resolveMentionable,
  setBoardMentionables,
  setDocMentionables,
  setUserAgentMentionables,
  toolMentionables,
} from './mentionables';
import { buildMentionPrefix } from './mentionInsertion';
import { hasExplicitMcpScope, parseAllMentions } from './mentionParser';

beforeAll(() => {
  // Set up some known mentionables
  setBoardMentionables([
    { id: 'board-abc', title: 'Kampagnenplan Berlin', slug: 'kampagnenplan-berlin' },
  ]);
  setDocMentionables([{ id: 'doc-xyz', title: 'Pressespiegel', slug: 'pressespiegel' }]);
  setUserAgentMentionables([
    {
      identifier: 'kv-klima-gruenerator',
      title: 'KV Klima-Grünerator',
      description: 'Klimapolitik im Kreisverband',
      avatar: '🌱',
      backgroundColor: '#316049',
      sharedFromGroup: 'KV Köln',
    },
  ]);
});

describe('mentionParser: unresolvedMentions', () => {
  it('known board mention resolves correctly', () => {
    const result = parseAllMentions('@kampagnenplan-berlin was steht hier?');
    expect(result.boardIds).toContain('board-abc');
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('known doc mention resolves correctly', () => {
    const result = parseAllMentions('@pressespiegel fasse zusammen');
    expect(result.docMentionIds).toContain('doc-xyz');
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('unknown @mention tracked as unresolved', () => {
    const result = parseAllMentions('@pressespiegel-lokal-13-03-26 schreib einen Tweet');
    expect(result.unresolvedMentions).toContain('pressespiegel-lokal-13-03-26');
    expect(result.boardIds).toHaveLength(0);
    expect(result.docMentionIds).toHaveLength(0);
  });

  it('multiple unknown mentions all tracked', () => {
    const result = parseAllMentions('@unknown-board @another-doc do something');
    expect(result.unresolvedMentions).toHaveLength(2);
    expect(result.unresolvedMentions).toContain('unknown-board');
    expect(result.unresolvedMentions).toContain('another-doc');
  });

  it('unresolved / mention NOT tracked (only @ mentions)', () => {
    const result = parseAllMentions('/nonexistent-skill do something');
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('mix of resolved and unresolved mentions', () => {
    const result = parseAllMentions('@kampagnenplan-berlin @nonexistent-doc vereinfache');
    expect(result.boardIds).toContain('board-abc');
    expect(result.unresolvedMentions).toContain('nonexistent-doc');
    expect(result.unresolvedMentions).toHaveLength(1);
  });

  it('@datei trigger NOT tracked as unresolved', () => {
    const result = parseAllMentions('@datei show picker');
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('@dokumentchat trigger NOT tracked as unresolved', () => {
    const result = parseAllMentions('@dokumentchat search docs');
    expect(result.unresolvedMentions).toHaveLength(0);
    expect(result.hasDocumentChat).toBe(true);
  });

  it('@datei:slug NOT tracked as unresolved even when slug unknown', () => {
    const result = parseAllMentions('@datei:unknown-slug do something');
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('@docs trigger resolves to docs-picker-trigger (not unresolved)', () => {
    const result = parseAllMentions('@docs browse documents');
    // @docs is registered as docs-picker-trigger in docToolMentionables
    expect(result.unresolvedMentions).toHaveLength(0);
  });
});

describe('document mentions merged into @docs', () => {
  it('@datei and @dokumentchat are no longer separate picker entries', () => {
    expect(documentMentionables).toHaveLength(0);
    expect(toolMentionables.some((m) => m.mention === 'dokumentchat')).toBe(false);
  });

  it('legacy @datei / @dokumentchat aliases redirect to the @docs entry', () => {
    for (const alias of ['datei', 'dokumentchat']) {
      const resolved = resolveMentionable(alias);
      expect(resolved?.identifier).toBe('docs-picker-trigger');
    }
  });

  it('typing an old document trigger surfaces the @docs entry in the picker', () => {
    const docs = filterMentionables('datei').docs;
    expect(docs.some((m) => m.identifier === 'docs-picker-trigger')).toBe(true);
  });
});

describe('mentionParser: @bundestag routes to the DIP tool, not the notebook', () => {
  // Regression: the Bundestagsfraktion notebook used to claim `alias:
  // 'bundestag'`. `rebuildMentionableMap` lists notebooks BEFORE tools and
  // keeps the first hit, so the notebook shadowed the DIP tool completely —
  // typing @bundestag scoped the chat to gruene-bundestag.de instead of
  // reaching the official Bundestag documentation, for every user.
  it('resolves @bundestag to the tool mentionable', () => {
    const m = resolveMentionable('bundestag');
    expect(m).not.toBeNull();
    expect(m?.type).toBe('tool');
    expect(m?.identifier).toBe('bundestag');
  });

  it('forces the bundestag tool and scopes no notebook', () => {
    const result = parseAllMentions('@bundestag worüber wurde zuletzt debattiert?');
    expect(result.forcedTools).toContain('bundestag');
    expect(result.notebookIds).not.toContain('bundestagsfraktion-notebook');
  });

  it('still reaches the notebook under its own alias', () => {
    const result = parseAllMentions('@bundestagsfraktion was steht dort?');
    expect(result.notebookIds).toContain('bundestagsfraktion-notebook');
    expect(result.forcedTools).not.toContain('bundestag');
  });
});

describe('mentionParser: skill mentions carry the recipe, not just the agent', () => {
  // Regression (live 20.08.2026): a fluently typed `/presse mehr artenschutz…`
  // routed the agent, stripped the text — and the recipe half never reached the
  // server, because only the popover select set `activeSkillMention`. The turn
  // came back as a research briefing instead of a Pressemitteilung.
  it('/presse sets skillMention alongside the agent routing', () => {
    const result = parseAllMentions('/presse mehr artenschutz in berlin');
    expect(result.agentId).toBe('gruenerator-oeffentlichkeitsarbeit');
    expect(result.agentMention).toBe('presse');
    expect(result.skillMention).toBe('presse');
    expect(result.cleanText).toBe('mehr artenschutz in berlin');
  });

  it('@presse behaves identically — skills live in the @-namespace', () => {
    const result = parseAllMentions('@presse mehr artenschutz in berlin');
    expect(result.agentId).toBe('gruenerator-oeffentlichkeitsarbeit');
    expect(result.skillMention).toBe('presse');
  });

  it('persists the choice as a durable skill token (mention as id)', () => {
    for (const text of ['/presse mehr artenschutz', '@presse mehr artenschutz']) {
      const result = parseAllMentions(text);
      expect(result.tokenText).toBe('@[Pressemitteilung](skill:presse) mehr artenschutz');
    }
  });

  it('last skill mention wins', () => {
    const result = parseAllMentions('/presse @instagram was ist besser?');
    expect(result.skillMention).toBe('instagram');
  });

  it('no skill in the text → skillMention stays null', () => {
    expect(parseAllMentions('@bundestag was lief zuletzt?').skillMention).toBeNull();
    expect(parseAllMentions('einfach nur text').skillMention).toBeNull();
  });

  it('a / that resolves to a non-skill stays inert — no token, no routing', () => {
    const result = parseAllMentions('/kampagnenplan-berlin was steht hier?');
    expect(result.boardIds).toHaveLength(0);
    expect(result.skillMention).toBeNull();
    expect(result.tokenText).toBe('was steht hier?');
  });
});

/**
 * Ein Grünerator ersetzt die handelnde Agentin — er ist kein Rezept. Stünde
 * sein Bezeichner in `skillMention`, suchte das Backend eine Textform dieses
 * Namens und kündigte sie in der Antwort an; und das Token müsste `skill:`
 * heissen, das beim Nachreichen einer bearbeiteten Nachricht erneut als Rezept
 * gelesen wird (#2909).
 */
describe('mentionParser: Grünerator-Agenten routen den Agenten, kein Rezept', () => {
  it('@grünerator setzt agentId, aber keine skillMention', () => {
    const result = parseAllMentions('@kv-klima-gruenerator was steht im wahlprogramm?');
    expect(result.agentId).toBe('kv-klima-gruenerator');
    expect(result.agentMention).toBe('kv-klima-gruenerator');
    expect(result.skillMention).toBeNull();
    expect(result.cleanText).toBe('was steht im wahlprogramm?');
  });

  it('persistiert ihn als agent-Token, nicht als skill-Token', () => {
    const result = parseAllMentions('@kv-klima-gruenerator leg los');
    expect(result.tokenText).toBe('@[KV Klima-Grünerator](agent:kv-klima-gruenerator) leg los');
  });

  it('lässt ein zuvor gewähltes Rezept unangetastet', () => {
    const result = parseAllMentions('@presse @kv-klima-gruenerator zum artenschutz');
    expect(result.agentId).toBe('kv-klima-gruenerator');
    expect(result.skillMention).toBe('presse');
  });
});

describe('durable tokens: idempotency and the pill prefix', () => {
  it('leaves an already-durable token untouched', () => {
    const text = '@[Tally](mcp:fb75887f-bf1c-4369) bau mir ein formular';
    const result = parseAllMentions(text);
    expect(result.tokenText).toBe(text);
    expect(result.unresolvedMentions).toHaveLength(0);
  });

  it('keeps a multi-word label intact — the second word is no new mention', () => {
    const text = '@[Google Drive](mcp:srv-7) suche die folien';
    expect(parseAllMentions(text).tokenText).toBe(text);
    expect(parseAllMentions(text).unresolvedMentions).toHaveLength(0);
  });

  it('the pill prefix equals what the plain form would have been rewritten to', () => {
    // The composer flushes pills as tokens now instead of `@kampagnenplan-berlin`.
    // Both must reach the wire as the same text, or persistence changes shape.
    const board = resolveMentionable('kampagnenplan-berlin');
    expect(board).toBeDefined();
    expect(buildMentionPrefix([board!])).toBe(
      parseAllMentions('@kampagnenplan-berlin').tokenText.trim()
    );
  });

  it('a flushed pill carries its routing in the token, not the body field', () => {
    // The client parser leaves durable tokens alone, so `boardIds` stays empty
    // — the id travels in the text and the server unions it back in
    // (deriveMentionTokenFields). Same contract as an edit-resubmit.
    const board = resolveMentionable('kampagnenplan-berlin');
    const result = parseAllMentions(`${buildMentionPrefix([board!])} was steht hier?`);
    expect(result.boardIds).toHaveLength(0);
    expect(result.unresolvedMentions).toHaveLength(0);
    expect(parseMentionTokens(result.tokenText)).toEqual([
      expect.objectContaining({ type: 'board', id: 'board-abc' }),
    ]);
  });
});

describe('hasExplicitMcpScope', () => {
  it('is false for a turn the user did not scope', () => {
    expect(hasExplicitMcpScope([], 'was gibt es neues?')).toBe(false);
    expect(hasExplicitMcpScope(['websearch'], 'was gibt es neues?')).toBe(false);
  });

  it('sees a hand-typed mention via forcedTools', () => {
    expect(hasExplicitMcpScope(['mcp:srv-7'], 'formular bitte')).toBe(true);
  });

  it('sees a flushed pill / edit-resubmit via the token alone', () => {
    // forcedTools is empty here: the parser skips durable tokens, so only the
    // text carries the scope. Missing this double-scoped the pinned connector.
    expect(hasExplicitMcpScope([], '@[Tally](mcp:srv-7) formular bitte')).toBe(true);
  });
});
