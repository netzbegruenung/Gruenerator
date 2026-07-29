/**
 * Tests for mentionParser — unresolvedMentions tracking
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  documentMentionables,
  filterMentionables,
  resolveMentionable,
  setBoardMentionables,
  setDocMentionables,
  toolMentionables,
} from './mentionables';
import { parseAllMentions } from './mentionParser';

beforeAll(() => {
  // Set up some known mentionables
  setBoardMentionables([
    { id: 'board-abc', title: 'Kampagnenplan Berlin', slug: 'kampagnenplan-berlin' },
  ]);
  setDocMentionables([{ id: 'doc-xyz', title: 'Pressespiegel', slug: 'pressespiegel' }]);
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
