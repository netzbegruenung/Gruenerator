/**
 * The artifact kinds a turn can SPAWN — one entry per kind, and every layer
 * that dispatches on a kind derives its table from here.
 *
 * Why a registry and not six tables. The kind set was written out by hand in
 * five places, keyed five different ways, and three of those could silently lose
 * a kind:
 *
 *  - `CompoundGenerationKind` — the union itself, a hand-written literal type;
 *  - `COMPOUND_TOOL_FOR` (loopGuarantees) — kind → loop tool NAME, typed
 *    `Record<string, string>`, so a missing or misspelt kind resolved to
 *    `undefined` and the forced-generation net then quietly did nothing;
 *  - `FORBIDDABLE_BY_KIND` (routing) — kind → negation family, `Partial<>`, so a
 *    missing kind skipped the re-check that stops a text-recovered kind from
 *    building the very artifact the user forbade;
 *  - the per-kind creation regexes plus the nested ternary that tries them in
 *    specificity order (routing);
 *  - the mount chain in `buildChatToolCatalog`, where a missing kind means no
 *    tool is mounted at all — and the loop guarantee then has nothing to call.
 *
 * Adding a kind now means adding an entry here; the consumers are total over
 * `ArtifactKindId`, so leaving one unserved is a compile error rather than a
 * turn that silently produces nothing.
 *
 * ORDER IS LOAD-BEARING. The array is in DETECTION order — the sequence
 * `compoundGenerationKind` tries the patterns in when it has to recover the kind
 * from the text: concrete products first, generic "Dokument" last (it is the
 * fallback artifact), and `pdf` ahead of `document` because "PDF-Dokument"
 * names both nouns but means a PDF. The dispatch order of the single-pass
 * create routes is a DIFFERENT order and is stated where it is used.
 *
 * What deliberately does NOT live here:
 *  - `ARTIFACT_NOUN_BY_KIND` / `ForbiddableArtifact` (fastPathGuards) answer a
 *    different question — which noun a family is NAMED by, for the negation
 *    guard — over a different set: they include `image` (not an artifact a
 *    create turn spawns) and exclude `sharepic` (whose vocabulary is the
 *    stricter `SHAREPIC_WORD_RE`). Folding the two sets together would give
 *    both questions the wrong domain.
 *  - `ArtifactSpec` (artifactKinds.ts) — the single-pass choreography config.
 *    It is keyed by intent, `sharepic` has none, and the document spec is a
 *    per-call factory. Referencing it from here would also drag the generators
 *    into every consumer of this module, including the classifier's routing
 *    leaf.
 */

import {
  ARTIFACT_CREATE_TOKENS,
  CHAT_INTENTS,
  type ArtifactCreateToken,
  type ChatIntentId,
} from '@gruenerator/shared/chat-intents';

import {
  creationOrderPattern,
  dictatesInlineTableColumns,
  type ForbiddableArtifact,
} from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';

export interface ArtifactKind {
  id: string;
  /**
   * The `create_*` intent that names this kind, or null when none does.
   * `document` and `board` have none: both predate the create_* intents and are
   * reached by mention or by a kind recovered from the text.
   *
   * Typed against the intent union, not `string`: this field feeds
   * `COMPOUND_GENERATION_INTENTS`, and the hand-written literal it replaces
   * carried a `satisfies` check for exactly that reason — a renamed intent used
   * to compile here and then silently never match.
   */
  intent: ChatIntentId | null;
  /**
   * The `@…` token that forces this kind, or null when there is no mention
   * (`sharepic` is reached by its own intent and its own vocabulary).
   *
   * F0, and single-sourced in `@gruenerator/shared/chat-intents` — the same
   * const the frontend mentionables and the artifact intents' `forcedTool` are
   * typed against, so the three writers of these strings cannot drift.
   */
  mentionToken: ArtifactCreateToken | null;
  /** The loop's fat-tool name — also the `enabledTools` key that gates it. */
  loopToolName: string;
  /**
   * Negation family for the re-check in `compoundGenerationKind`. Null for
   * `sharepic` on purpose: `hasExplicitSharepicWord` already refuses a negated
   * ask, so a second guard would be dead code.
   */
  forbiddableFamily: ForbiddableArtifact | null;
  /**
   * Creation-ORDER pattern: a creation verb that actually points at this kind's
   * noun. Null for `sharepic`, whose vocabulary is `SHAREPIC_WORD_RE` and whose
   * detection is therefore spelled out at the call site.
   *
   * A turn that merely MENTIONS the noun ("was steht im PDF?") must not match —
   * that is what `creationOrderPattern` buys, and why nothing here is a plain
   * noun regex.
   */
  createPattern: RegExp | null;
  /**
   * An extra condition the text must ALSO satisfy. Only `sheet` has one: a
   * request that dictates the columns inline wants a table in the answer, not a
   * spreadsheet.
   *
   * Spelled out as `null` on the other five rather than omitted: an optional
   * property disappears from the entry's literal type under `as const`, so
   * iterating the registry could not see the field at all.
   */
  extraGuard: ((text: string) => boolean) | null;
  /** Product name in prose ("Präsentation"), for tool descriptions and notes. */
  label: string;
}

export const ARTIFACT_KINDS = [
  {
    id: 'sharepic',
    intent: 'sharepic',
    mentionToken: null,
    loopToolName: 'sharepic',
    forbiddableFamily: null,
    createPattern: null,
    label: 'Sharepic',
    extraGuard: null,
  },
  {
    id: 'presentation',
    intent: 'create_presentation',
    mentionToken: ARTIFACT_CREATE_TOKENS.presentation,
    loopToolName: 'create_presentation',
    forbiddableFamily: 'presentation',
    createPattern: creationOrderPattern('pr[äa]sentation|presentation|folien?|slides?'),
    label: 'Präsentation',
    extraGuard: null,
  },
  {
    id: 'sheet',
    intent: 'create_sheet',
    mentionToken: ARTIFACT_CREATE_TOKENS.sheet,
    loopToolName: 'create_sheet',
    forbiddableFamily: 'sheet',
    createPattern: creationOrderPattern('tabelle|kalkulation|spreadsheet|sheet'),
    extraGuard: (text: string) => !dictatesInlineTableColumns(text),
    label: 'Tabelle',
  },
  {
    id: 'board',
    intent: null,
    mentionToken: ARTIFACT_CREATE_TOKENS.board,
    loopToolName: 'create_board',
    forbiddableFamily: 'board',
    createPattern: creationOrderPattern('board|kanban|aufgabenboard|taskboard'),
    label: 'Board',
    extraGuard: null,
  },
  {
    id: 'pdf',
    intent: 'create_pdf',
    mentionToken: ARTIFACT_CREATE_TOKENS.pdf,
    loopToolName: 'create_pdf',
    forbiddableFamily: 'pdf',
    createPattern: creationOrderPattern(
      'pdf|briefkopf|antragsformular|anmeldeformular|fragebogen' +
        '|(?:ausf(?:ü|ue)llbar)[a-zäöü]*\\s+(?:formular|vorlage)',
      { extraVerbs: 'schreib', forward: 60 }
    ),
    label: 'PDF',
    extraGuard: null,
  },
  {
    id: 'document',
    intent: null,
    mentionToken: ARTIFACT_CREATE_TOKENS.document,
    loopToolName: 'create_document',
    forbiddableFamily: 'document',
    createPattern: creationOrderPattern('dokument|schriftst[üu]ck|textdokument|entwurf', {
      extraVerbs: 'schreib|anleg',
    }),
    label: 'Dokument',
    extraGuard: null,
  },
] as const satisfies readonly ArtifactKind[];

/** The kind ids, derived. Consumers take this, never a bare `string`. */
export type ArtifactKindId = (typeof ARTIFACT_KINDS)[number]['id'];

const BY_ID: Readonly<Record<ArtifactKindId, ArtifactKind>> = Object.fromEntries(
  ARTIFACT_KINDS.map((k) => [k.id, k])
) as Record<ArtifactKindId, ArtifactKind>;

export function artifactKind(id: ArtifactKindId): ArtifactKind {
  return BY_ID[id];
}

/**
 * Whether a compound (loop) turn hands this kind's job to the generation fat
 * tool instead of letting the single-pass create route build it.
 *
 * Derived from the intent registry, where `ArtifactIntent.skipOnAgentic` already
 * declares it — `createIntentStage` used to re-type the five booleans.
 *
 * `false` for a kind with no `create_*` intent, and that is a statement rather
 * than a default: `board` and `document` are reached by mention (or by a kind
 * recovered from the text), so no intent declares anything for them, and both
 * DO build here even on a loop turn.
 */
export function skipsOnAgenticForKind(id: ArtifactKindId): boolean {
  const { intent } = artifactKind(id);
  if (intent == null) return false;
  const def = CHAT_INTENTS[intent];
  return def.category === 'artifact' ? def.skipOnAgentic : false;
}

/**
 * The intents that NAME an artifact kind — the set whose turns a research signal
 * can lift into the loop. Derived, so it cannot list an intent the registry has
 * no kind for (or miss one it does).
 */
export const ARTIFACT_NAMING_INTENTS: ReadonlySet<ChatIntentId> = new Set(
  // `flatMap` rather than `map(...).filter(predicate)`: the entries carry a
  // NARROWED literal union, so a `i is ChatIntentId` predicate would be wider
  // than its own parameter and fail to compile.
  ARTIFACT_KINDS.flatMap((k) => (k.intent == null ? [] : [k.intent]))
);
