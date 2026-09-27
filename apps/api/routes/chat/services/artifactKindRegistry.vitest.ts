/**
 * Behaviour-neutrality proof for the artifact-kind registry.
 *
 * The fixtures below are the state of the code BEFORE the registry existed,
 * copied verbatim from the five tables it replaced. Same shape of proof as
 * `chatIntents.vitest.ts` and for the same reason: the registry is a pure
 * derivation, so every value it now produces must equal the literal it took
 * over. A refactor that "looks equivalent" is not; this is what makes it
 * checkable, and what will fail loudly if a later edit changes a value while
 * meaning to change a structure.
 *
 * The compile-level half of the guarantee is not here and cannot be: it is that
 * a `Record<ArtifactKindId, …>` cannot omit a kind. Adding a seventh kind to the
 * registry breaks `tsc` at the toolCatalog mount table — see the note there.
 */
import { CHAT_INTENTS } from '@gruenerator/shared/chat-intents';
import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_KINDS,
  ARTIFACT_NAMING_INTENTS,
  artifactKind,
  skipsOnAgenticForKind,
  type ArtifactKindId,
} from './artifactKindRegistry.js';

// ---------------------------------------------------------------------------
// The five tables, as they stood before.
// ---------------------------------------------------------------------------

/** `loopGuarantees.COMPOUND_TOOL_FOR` — was `Record<string, string>`. */
const BEFORE_COMPOUND_TOOL_FOR: Record<string, string> = {
  sharepic: 'sharepic',
  presentation: 'create_presentation',
  sheet: 'create_sheet',
  document: 'create_document',
  board: 'create_board',
  pdf: 'create_pdf',
};

/** `routing.FORBIDDABLE_BY_KIND` — was `Partial<>`, sharepic deliberately absent. */
const BEFORE_FORBIDDABLE_BY_KIND: Record<string, string | undefined> = {
  presentation: 'presentation',
  sheet: 'sheet',
  board: 'board',
  pdf: 'pdf',
  document: 'document',
};

/** `createIntentStage.createRoutes`, in dispatch order. */
const BEFORE_CREATE_ROUTES = [
  { kind: 'board', forcedTool: 'board-erstellen', intent: null, skipOnAgentic: false },
  { kind: 'document', forcedTool: 'dokument-erstellen', intent: null, skipOnAgentic: false },
  { kind: 'sheet', forcedTool: 'sheet-erstellen', intent: 'create_sheet', skipOnAgentic: true },
  {
    kind: 'presentation',
    forcedTool: 'praesentation-erstellen',
    intent: 'create_presentation',
    skipOnAgentic: true,
  },
  { kind: 'pdf', forcedTool: 'pdf-erstellen', intent: 'create_pdf', skipOnAgentic: true },
] as const;

/** `domainTools.DOC_LABELS` — the label half (the phrase stayed local). */
const BEFORE_DOC_LABELS: Record<string, string> = {
  presentation: 'Präsentation',
  sheet: 'Tabelle',
  document: 'Dokument',
};

/** `routing.compoundGenerationKind`'s ternary, in the order it tried them. */
const BEFORE_DETECTION_ORDER = [
  'sharepic',
  'presentation',
  'sheet',
  'board',
  'pdf',
  'document',
] as const;

/** `routing.COMPOUND_GENERATION_INTENTS`. */
const BEFORE_COMPOUND_GENERATION_INTENTS = [
  'sharepic',
  'create_presentation',
  'create_sheet',
  'create_pdf',
] as const;

/** `toolCatalog`'s mount chain: kind → (enabledTools key, catalog key). */
const BEFORE_CATALOG_KEYS: Record<string, { enabledKey: string; toolKey: string }> = {
  sharepic: { enabledKey: 'sharepic', toolKey: 'sharepic' },
  presentation: { enabledKey: 'create_presentation', toolKey: 'create_presentation' },
  sheet: { enabledKey: 'create_sheet', toolKey: 'create_sheet' },
  document: { enabledKey: 'create_document', toolKey: 'create_document' },
  board: { enabledKey: 'create_board', toolKey: 'create_board' },
  pdf: { enabledKey: 'create_pdf', toolKey: 'create_pdf' },
};

// ---------------------------------------------------------------------------

describe('artifact kind registry — the set itself', () => {
  it('covers exactly the six kinds, in the old detection order', () => {
    // Order is behaviour: `recoverKindFromText` walks the array, so this is the
    // specificity chain the ternary encoded (pdf before document, generic
    // "Dokument" last).
    expect(ARTIFACT_KINDS.map((k) => k.id)).toEqual([...BEFORE_DETECTION_ORDER]);
  });

  it('has no duplicate id, token or loop tool name', () => {
    const unique = (xs: readonly (string | null)[]): number =>
      new Set(xs.filter((x) => x != null)).size;
    expect(unique(ARTIFACT_KINDS.map((k) => k.id))).toBe(ARTIFACT_KINDS.length);
    expect(unique(ARTIFACT_KINDS.map((k) => k.loopToolName))).toBe(ARTIFACT_KINDS.length);
    // Five tokens: `sharepic` has none.
    expect(unique(ARTIFACT_KINDS.map((k) => k.mentionToken))).toBe(5);
  });
});

describe('artifact kind registry — derived tables equal the ones they replaced', () => {
  it('loop tool name per kind (was COMPOUND_TOOL_FOR)', () => {
    for (const kind of ARTIFACT_KINDS) {
      expect(kind.loopToolName, kind.id).toBe(BEFORE_COMPOUND_TOOL_FOR[kind.id]);
    }
  });

  it('negation family per kind (was FORBIDDABLE_BY_KIND)', () => {
    for (const kind of ARTIFACT_KINDS) {
      // The old table was Partial: a missing key read as `undefined`, which the
      // call site treated as "no re-check". `null` is that same statement, now
      // spelled out.
      expect(kind.forbiddableFamily ?? undefined, kind.id).toBe(
        BEFORE_FORBIDDABLE_BY_KIND[kind.id]
      );
    }
  });

  it('sharepic carries no negation family, on purpose', () => {
    // hasExplicitSharepicWord already refuses a negated ask; a second guard here
    // would be dead code. Pinned because "absent" and "forgotten" look alike.
    expect(artifactKind('sharepic').forbiddableFamily).toBeNull();
  });

  it('label per kind (was DOC_LABELS)', () => {
    for (const [kind, label] of Object.entries(BEFORE_DOC_LABELS)) {
      expect(artifactKind(kind as ArtifactKindId).label).toBe(label);
    }
  });

  it('create-route columns per kind (was createRoutes)', () => {
    for (const before of BEFORE_CREATE_ROUTES) {
      const kind = artifactKind(before.kind);
      expect(kind.mentionToken, before.kind).toBe(before.forcedTool);
      expect(kind.intent ?? null, before.kind).toBe(before.intent);
      expect(skipsOnAgenticForKind(before.kind), before.kind).toBe(before.skipOnAgentic);
    }
  });

  it('the intents that name a kind (was COMPOUND_GENERATION_INTENTS)', () => {
    expect([...ARTIFACT_NAMING_INTENTS].sort()).toEqual(
      [...BEFORE_COMPOUND_GENERATION_INTENTS].sort()
    );
  });

  it('catalog key and enabledTools key are the same string, per kind', () => {
    // The mount site now uses `loopToolName` for BOTH. That was already true of
    // every branch in the old chain, and it is what lets
    // `forceCompoundGeneration` find the tool it is supposed to call — so it is
    // worth pinning rather than rediscovering.
    for (const kind of ARTIFACT_KINDS) {
      const before = BEFORE_CATALOG_KEYS[kind.id];
      expect(before?.enabledKey, kind.id).toBe(before?.toolKey);
      expect(kind.loopToolName, kind.id).toBe(before?.toolKey);
    }
  });
});

describe('artifact kind registry — the ties to the intent registry', () => {
  it('every named intent really is an artifact/generation intent that exists', () => {
    for (const id of ARTIFACT_NAMING_INTENTS) {
      expect(CHAT_INTENTS[id], id).toBeDefined();
    }
  });

  it('the mention token matches the intent registry wherever both name one', () => {
    // The F0 strings live once (ARTIFACT_CREATE_TOKENS) and are read by three
    // consumers. Where an artifact intent also declares a `forcedTool`, the two
    // must agree — this is the pair that would silently split.
    for (const kind of ARTIFACT_KINDS) {
      if (kind.intent == null) continue;
      const def = CHAT_INTENTS[kind.intent];
      if (def.category !== 'artifact') continue;
      expect(def.forcedTool, kind.id).toBe(kind.mentionToken);
    }
  });

  it('save_as_doc keeps the document token even though the kind names no intent', () => {
    // `document`'s registry entry has `intent: null` because the create ROUTE
    // has no intent trigger — only the mention fires it. `save_as_doc` still
    // owns the same F0 token, and that asymmetry is deliberate: save_as_doc is
    // served by the confirm-action path, not by this route.
    const saveAsDoc = CHAT_INTENTS['save_as_doc'];
    expect(saveAsDoc.category).toBe('artifact');
    if (saveAsDoc.category !== 'artifact') return;
    expect(saveAsDoc.forcedTool).toBe(artifactKind('document').mentionToken);
    expect(artifactKind('document').intent).toBeNull();
  });
});

describe('artifact kind registry — the patterns', () => {
  it('every kind but sharepic carries a creation-order pattern', () => {
    for (const kind of ARTIFACT_KINDS) {
      if (kind.id === 'sharepic') {
        expect(kind.createPattern).toBeNull();
        continue;
      }
      expect(kind.createPattern, kind.id).not.toBeNull();
    }
  });

  it('only sheet carries an extra guard', () => {
    const withGuard = ARTIFACT_KINDS.filter((k) => k.extraGuard != null).map((k) => k.id);
    expect(withGuard).toEqual(['sheet']);
  });

  it('a pattern needs a creation VERB, not just the noun', () => {
    // The property that makes these patterns safe to run over free text: a turn
    // that merely mentions an artifact must not read as an order to build one.
    for (const kind of ARTIFACT_KINDS) {
      if (!kind.createPattern) continue;
      expect(kind.createPattern.test(`Was steht in der ${kind.label}?`), kind.id).toBe(false);
    }
  });
});
