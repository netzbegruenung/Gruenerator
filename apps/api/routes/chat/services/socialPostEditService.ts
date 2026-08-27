/**
 * social_post text edit (EXPERIMENTAL): natural-language editing of the TEXT
 * half of a combined social post ("mach den Text knackiger", "andere
 * Hashtags"). Sibling of sharepicEditService in structure — resolve target
 * from the thread → one LLM call → persist → SSE → fixed reply — but edits
 * prose, not canvas ops, so there is no mint/descriptor machinery.
 *
 * Versioning: the post's version history lives INSIDE the original message's
 * `social_post` tool-call result (`versions` array + head fields), updated
 * in place like sharepicEditService's attachCanvasIdToMessage. No new table.
 */

import { SOCIAL_PLATFORM_INFO, type SocialPostToolResult } from '@gruenerator/contracts';

// Dasselbe Handwerk wie beim Erzeugen — sonst überarbeitet der Edit-Turn den
// Post gegen eine ANDERE Formvorgabe als die, nach der er entstanden ist. Die
// gewählte Textform steht hier nicht zur Verfügung (der Edit-Turn kennt nur den
// persistierten Post), die erkannte Plattform genügt. Die `userId` geht mit,
// damit ein angelernter Stil auch beim Überarbeiten gilt und nicht nur beim
// Erzeugen — sonst schriebe der Edit-Turn den Post auf das mitgelieferte Rezept
// zurück.
import { craftGuidanceForPlatform } from '../../../agents/langgraph/ChatGraph/nodes/socialMediaComposerNode.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { aiText } from '../../../services/ai/generate.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';
import { createLogger } from '../../../utils/logger.js';

import { finishEditTurn } from './editTurnCompletion.js';
import { looksLikeRefusal } from './refusalDetection.js';
import { parseSocialPostText } from './socialPostService.js';

import type { SSEWriter } from './sseHelpers.js';

const log = createLogger('SocialPostEdit');

/**
 * Shown when the edit model declines the instruction. Says WHY and states that
 * the existing post survived — the decline is the system working, and the user
 * needs to know their artifact is intact.
 *
 * Deliberately does NOT invite a rephrasing: the requests that land here are
 * fabricated claims about real people, and "magst du das anders formulieren?"
 * coaches the retry of something we just refused.
 */
export const SOCIAL_EDIT_REFUSAL_TEXT =
  'Diese Änderung setze ich nicht um — sie widerspricht den inhaltlichen Regeln des Grünerators, ' +
  'etwa erfundene Behauptungen über real existierende Personen. Dein bestehender Post bleibt unverändert.';

export { isSocialTextEditInstruction } from './socialPostEditHeuristics.js';

interface PostHit {
  post: SocialPostToolResult;
  messageId: string;
}

/**
 * Resolve the post an edit targets. With an explicit `postId` (the user
 * activated a card — "Text im Chat bearbeiten"), that post wins wherever it
 * sits in the thread. Without one, the NEWEST ARTIFACT wins: scanning
 * newest-first, a sharepic-only message encountered before any social_post
 * message means the user's ambient instruction ("kürzer") most plausibly
 * targets that sharepic — return null so the sharepic edit/refinement paths
 * take over instead of rewriting an older post.
 */
export async function findSocialPost(
  threadId: string,
  postId: string | null
): Promise<PostHit | null> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT id, tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT 30`,
    [threadId]
  )) as Array<{ id: string; tool_results: unknown }>;

  for (const row of rows) {
    const meta = (
      typeof row.tool_results === 'string' ? JSON.parse(row.tool_results) : row.tool_results
    ) as { toolCalls?: Array<{ toolName?: string; result?: unknown }> } | null;
    const call = meta?.toolCalls?.find((tc) => tc?.toolName === 'social_post');
    const result = call?.result as SocialPostToolResult | undefined;
    const isPost = result?.postId != null && typeof result.text === 'string';

    if (postId != null) {
      if (isPost && result.postId === postId) return { post: result, messageId: row.id };
      continue;
    }

    if (isPost) return { post: result, messageId: row.id };
    // Edit turns persist compact tool calls; they count as artifact activity.
    // A text-edit turn re-targets its post explicitly (one-level recursion).
    const editedPostId = (
      meta?.toolCalls?.find((tc) => tc?.toolName === 'social_post_edit')?.result as
        { postId?: string } | undefined
    )?.postId;
    if (editedPostId) return findSocialPost(threadId, editedPostId);
    // Newer sharepic-only artifact shadows older posts (see doc comment).
    if (
      meta?.toolCalls?.some((tc) => tc?.toolName === 'sharepic' || tc?.toolName === 'sharepic_edit')
    ) {
      return null;
    }
  }
  return null;
}

/** Rewrite the persisted head fields + append the new version entry. */
async function updatePostOnMessage(
  messageId: string,
  postId: string,
  head: { text: string; hashtags: string[]; charCount: number; version: number },
  versionEntry: SocialPostToolResult['versions'][number]
): Promise<void> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(`SELECT tool_results FROM chat_messages WHERE id = $1`, [
    messageId,
  ])) as Array<{ tool_results: unknown }>;
  const raw = rows[0]?.tool_results;
  if (!raw) return;
  const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
    toolCalls?: Array<{ toolName?: string; result?: SocialPostToolResult }>;
  };
  let changed = false;
  for (const tc of meta.toolCalls ?? []) {
    if (tc?.toolName !== 'social_post' || tc.result?.postId !== postId) continue;
    tc.result = {
      ...tc.result,
      ...head,
      versions: [...(tc.result.versions ?? []), versionEntry],
    };
    changed = true;
  }
  if (changed) {
    await pg.query(`UPDATE chat_messages SET tool_results = $2 WHERE id = $1`, [
      messageId,
      JSON.stringify(meta),
    ]);
  }
}

export interface HandleSocialPostEditArgs {
  sse: SSEWriter;
  threadId: string;
  userId: string;
  instruction: string;
  /** Explicitly activated post (card toggle) — overrides recency targeting. */
  postId?: string | null;
  startTime: number;
  classificationTimeMs?: number;
}

async function finishWithText(
  args: HandleSocialPostEditArgs,
  text: string,
  toolCalls?: Record<string, unknown>[]
): Promise<void> {
  await finishEditTurn({
    sse: args.sse,
    threadId: args.threadId,
    text,
    intent: 'social_post_edit',
    persistLabel: 'socialPostEdit:persist',
    logPrefix: '[SocialPostEdit]',
    startTime: args.startTime,
    ...(args.classificationTimeMs != null && { classificationTimeMs: args.classificationTimeMs }),
    ...(toolCalls ? { toolCalls } : {}),
  });
}

/**
 * Run a text-edit turn. Returns true when handled (stream closed) — the
 * router then skips stages 2–4. Returns false when the thread has no social
 * post to edit, so the message falls through to the sharepic edit path.
 */
export async function handleSocialPostTextEdit(args: HandleSocialPostEditArgs): Promise<boolean> {
  const { sse, threadId, instruction } = args;

  try {
    const hit = await findSocialPost(threadId, args.postId ?? null);
    if (!hit) return false;

    const { post, messageId } = hit;
    const platform = post.platform ?? 'generic';
    const info = SOCIAL_PLATFORM_INFO[platform];

    sse.send('progress_step', {
      stepId: `social_post_edit_${Date.now()}`,
      toolName: 'social_post_edit',
      title: 'Überarbeite den Text…',
      status: 'in_progress',
    });

    const craftGuidance = await craftGuidanceForPlatform(
      platform === 'generic' ? null : platform,
      null,
      args.userId
    );

    const systemPrompt = `Du überarbeitest einen bestehenden Social-Media-Post der Grünen nach einer Nutzer-Anweisung.

${craftGuidance}

## ZEICHENBUDGET
Ziel: ~${info.recommendedChars} Zeichen. Hartes Maximum: ${info.maxChars} Zeichen (inklusive Hashtags).

## REGELN
- Setze NUR die Anweisung um; alles andere (Aussage, Fakten, Struktur) bleibt so nah wie möglich am Original.
- Erfinde keine Fakten oder Zitate.
- Kein Meta-Text ("Hier ist der überarbeitete Post...") — antworte NUR mit dem fertigen Post inklusive Hashtags.`;

    const userPrompt = `## AKTUELLER POST\n${post.text}\n\n## ANWEISUNG\n${instruction}`;

    const edited = await aiText({
      lane: 'social_post_edit',
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
    });

    // `aiText` throws when nothing answered — that lands in the catch below.
    // What it does NOT throw on is an answer that carried a tool call and no
    // prose; that arrives here as an empty string and belongs on the gentler
    // "say it differently" path, not on the generic failure message.
    if (!edited) {
      sse.send('social_post_edit_error', { postId: post.postId, error: 'Empty edit response' });
      await finishWithText(
        args,
        'Die Textänderung hat leider nicht geklappt. Magst du sie anders formulieren?'
      );
      return true;
    }

    const parsed = parseSocialPostText(edited);

    // A decline is not an edit. Without this the refusal string itself was
    // persisted as the new version — "I'm sorry, but I can't help with that."
    // replaced a perfectly good post, and the chat still reported success.
    // Checked on the raw content too: a refusal ending in a stray hashtag
    // would otherwise reach the gate already stripped.
    if (looksLikeRefusal(edited) || looksLikeRefusal(parsed.text)) {
      log.info(
        `[SocialPostEdit] ${post.postId} — model declined the instruction; ` +
          `post left at v${post.version ?? 1}, no version written`
      );
      await finishWithText(args, SOCIAL_EDIT_REFUSAL_TEXT);
      return true;
    }

    const newVersion = (post.version ?? 1) + 1;
    const summary = instruction.length > 120 ? `${instruction.slice(0, 117)}…` : instruction;
    const head = {
      text: parsed.text,
      hashtags: parsed.hashtags,
      charCount: parsed.charCount,
      version: newVersion,
    };

    await updatePostOnMessage(messageId, post.postId, head, {
      ...head,
      summary,
      createdAt: new Date().toISOString(),
    });

    sse.send('social_post_updated', {
      postId: post.postId,
      post: { ...post, ...head },
      summary,
    });

    log.info(
      `[SocialPostEdit] ${post.postId} → v${newVersion} (${parsed.charCount} chars, "${summary}")`
    );

    await finishWithText(
      args,
      'Ich habe den Text angepasst. Sag mir, wenn ich noch etwas ändern soll.',
      [
        {
          toolCallId: `tc_${Date.now()}`,
          toolName: 'social_post_edit',
          args: { query: instruction },
          result: { postId: post.postId, version: newVersion, summary },
        },
      ]
    );
    return true;
  } catch (error) {
    log.error('[SocialPostEdit] Edit turn failed:', error);
    if (!sse.isEnded()) {
      sse.send('social_post_edit_error', {
        error: toUserFacingMessage(error, 'Unbekannter Fehler'),
      });
      await finishWithText(
        args,
        'Bei der Textbearbeitung ist etwas schiefgelaufen. Versuch es bitte noch einmal.'
      );
    }
    return true;
  }
}
