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

import { rubricForPlatform } from '../../../agents/langgraph/ChatGraph/nodes/socialMediaComposerNode.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

import { parseSocialPostText } from './socialPostService.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type { Request } from 'express';

const log = createLogger('SocialPostEdit');

export { isSocialTextEditInstruction } from './socialPostEditHeuristics.js';

interface PostHit {
  post: SocialPostToolResult;
  messageId: string;
}

/**
 * Most recent assistant message carrying a `social_post` tool call. Newer
 * posts shadow older ones — an edit always targets the latest.
 */
export async function findLatestSocialPost(threadId: string): Promise<PostHit | null> {
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
    if (result?.postId && typeof result.text === 'string') {
      return { post: result, messageId: row.id };
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
  req?: Request;
  threadId: string;
  userId: string;
  instruction: string;
  aiWorkerPool: AIWorkerPool;
  startTime: number;
  classificationTimeMs?: number;
}

async function finishWithText(
  args: HandleSocialPostEditArgs,
  text: string,
  toolCalls?: Record<string, unknown>[]
): Promise<void> {
  const { sse, threadId } = args;
  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  sse.send('text_delta', { text });
  sse.sendRaw('done', {
    threadId,
    citations: [],
    metadata: {
      intent: 'social_post_edit',
      searchCount: 0,
      totalTimeMs: Date.now() - args.startTime,
      ...(args.classificationTimeMs != null && {
        classificationTimeMs: args.classificationTimeMs,
      }),
      searchTimeMs: 0,
    },
  });
  try {
    await createMessage(threadId, 'assistant', text, {
      intent: 'social_post_edit',
      ...(toolCalls ? { toolCalls } : {}),
    });
    await touchThread(threadId);
  } catch (err) {
    log.error('[SocialPostEdit] Failed to persist message:', err);
  }
  sse.end();
}

/**
 * Run a text-edit turn. Returns true when handled (stream closed) — the
 * router then skips stages 2–4. Returns false when the thread has no social
 * post to edit, so the message falls through to the sharepic edit path.
 */
export async function handleSocialPostTextEdit(args: HandleSocialPostEditArgs): Promise<boolean> {
  const { sse, req, threadId, instruction, aiWorkerPool } = args;

  try {
    const hit = await findLatestSocialPost(threadId);
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

    const systemPrompt = `Du überarbeitest einen bestehenden Social-Media-Post der Grünen nach einer Nutzer-Anweisung.

${rubricForPlatform(platform === 'generic' ? null : platform)}

## ZEICHENBUDGET
Ziel: ~${info.recommendedChars} Zeichen. Hartes Maximum: ${info.maxChars} Zeichen (inklusive Hashtags).

## REGELN
- Setze NUR die Anweisung um; alles andere (Aussage, Fakten, Struktur) bleibt so nah wie möglich am Original.
- Erfinde keine Fakten oder Zitate.
- Kein Meta-Text ("Hier ist der überarbeitete Post...") — antworte NUR mit dem fertigen Post inklusive Hashtags.`;

    const userPrompt = `## AKTUELLER POST\n${post.text}\n\n## ANWEISUNG\n${instruction}`;

    const result = await aiWorkerPool.processRequest(
      {
        type: 'social_post_edit',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: { temperature: 0.5, max_tokens: 1200 },
      },
      req as (Request & { user?: { id?: string }; sessionID?: string }) | null
    );

    if (!result.success || !result.content) {
      sse.send('social_post_edit_error', {
        postId: post.postId,
        error: result.error || 'Empty edit response',
      });
      await finishWithText(
        args,
        'Die Textänderung hat leider nicht geklappt. Magst du sie anders formulieren?'
      );
      return true;
    }

    const parsed = parseSocialPostText(result.content);
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
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
      await finishWithText(
        args,
        'Bei der Textbearbeitung ist etwas schiefgelaufen. Versuch es bitte noch einmal.'
      );
    }
    return true;
  }
}
