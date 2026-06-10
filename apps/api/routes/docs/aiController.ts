/**
 * Docs AI Controller
 * Handles AI-powered document editing via BlockNote xl-ai extension
 *
 * Uses the Vercel AI SDK's pipeUIMessageStreamToResponse() to stream SSE-framed
 * UIMessageChunks directly to Express. This matches the format that
 * DefaultChatTransport's EventSourceParserStream expects on the frontend.
 *
 * Block format: markdown (xl-ai `_experimental_markdown`). The HTML format's
 * rebase tool throws `html diff` whenever the target block contains inline
 * style spans (e.g. color/background) that don't round-trip cleanly through
 * `blocksToHTMLLossy → tryParseHTMLToBlocks`. The markdown format uses
 * `blocksToMarkdownLossy` (drops those spans naturally) and *absorbs*
 * round-trip drift into the transaction instead of rejecting it, so the
 * failure mode disappears.
 */

import { type ServerResponse } from 'node:http';

import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { streamText, convertToModelMessages } from 'ai';
import { type Response } from 'express';
import { z } from 'zod';

import { rateLimitMiddleware } from '../../middleware/rateLimitMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';
import { type AgentConfig } from '../chat/agents/types.js';

import { checkDocumentWriteAccess } from './documentAccess.js';

const log = createLogger('DocsAI');
const router = createAuthenticatedRouter();

const docsAiFormat = aiDocumentFormats._experimental_markdown;

/**
 * Strict prompt for BlockNote document operations.
 * Modeled after suitenumerique/docs (github.com/suitenumerique/docs).
 * Explicitly lists valid operation shapes so the LLM doesn't hallucinate types.
 */
const BLOCKNOTE_TOOL_STRICT_PROMPT = `
You are editing a BlockNote document via the tool applyDocumentOperations.

You MUST respond ONLY by calling applyDocumentOperations.
The tool input MUST be valid JSON:
{ "operations": [ ... ] }

Each operation MUST include "type" and it MUST be one of:
- "update" (requires: id, block)
- "add"    (requires: referenceId, position, blocks)
- "delete" (requires: id)

VALID SHAPES (FOLLOW EXACTLY):

Update:
{ "type":"update", "id":"<id$>", "block":"<markdown for ONE block>" }
IMPORTANT: "block" MUST be a STRING containing markdown for a SINGLE block (one paragraph, one heading, one list item, one quote, etc).

Add:
{ "type":"add", "referenceId":"<id$>", "position":"before|after", "blocks":["<md block>", ...] }
IMPORTANT: "blocks" MUST be an ARRAY OF STRINGS, each a single markdown block.

Delete:
{ "type":"delete", "id":"<id$>" }

IDs ALWAYS end with "$". Use ids EXACTLY as provided.
Do NOT use "replace", "insert", "modify", or any other type value.
Return ONLY the JSON tool input. No prose, no code fences, no commentary.`;

export const aiRequestBodySchema = z.object({
  // The document being edited. Auth middleware only proves *who* the caller
  // is — this id is what lets the handler check they may *edit* the document
  // (and ties the AI call to a doc for the telemetry log).
  documentId: z.string().uuid(),
  messages: z.array(z.unknown()),
  toolDefinitions: z.record(z.string(), z.unknown()),
  // Optional: when the docs-chat panel forwards an edit request, the prior
  // assistant turn (the rewritten Antrag, the drafted PM, etc.) is sent here
  // so the model can resolve referential commands like "im dokument einfügen"
  // / "füge dies ein". Surfaced into the system prompt — NOT mixed into
  // userPrompt — so the model treats it as instructional context, not
  // content to insert verbatim.
  referenceContent: z.string().nullish(),
});

export type AiRequestBody = z.infer<typeof aiRequestBodySchema>;

// Per-provider model map. Model IDs are not portable across providers — LiteLLM's
// verdigado proxy has no Mistral models, and Regolo's gpt-oss endpoint leaks
// reasoning into content (verified failure for tool calls). Each entry below was
// probed against a tool-call request and confirmed to return finish_reason:tool_calls.
const DOCS_AI_MODELS: Record<AgentConfig['provider'], string> = {
  litellm: 'gpt-oss:120b',
  regolo: 'mistral-small-4-119b',
  mistral: 'mistral-medium-2604',
  anthropic: 'mistral-medium-2604',
};

/**
 * @route   POST /api/docs/ai
 * @desc    Process AI requests for document editing
 * @access  Private
 */
export async function handleAiRequest(req: TypedRequest<AiRequestBody>, res: Response) {
  try {
    const { documentId, messages, toolDefinitions, referenceContent } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!(await checkDocumentWriteAccess(documentId, userId))) {
      log.warn(`[DocsAI] User ${userId} denied AI edit on document ${documentId}`);
      return res.status(403).json({ error: 'No edit permission for this document' });
    }

    log.info(
      `[DocsAI] Request received for doc ${documentId}: ${messages.length} messages, ${Object.keys(toolDefinitions).length} tools, refContentChars: ${referenceContent?.length ?? 0}`
    );

    log.info(`[DocsAI] Tool definitions received: ${Object.keys(toolDefinitions).join(', ')}`);

    // Order: mistral first (mistral-medium-2604 / Medium 3.5), then regolo
    // (mistral-small-4-119b), litellm last (gpt-oss).
    const providerChain: AgentConfig['provider'][] = ['mistral', 'regolo', 'litellm'];
    const provider = providerChain.find((p) => isProviderConfigured(p));

    if (!provider) {
      log.error('[DocsAI] No AI provider configured (tried: mistral, regolo, litellm)');
      return res.status(500).json({ error: 'AI provider not configured' });
    }

    const modelId = DOCS_AI_MODELS[provider];
    log.info(`[DocsAI] Using provider: ${provider}, model: ${modelId} (format: markdown)`);
    const model = getModel(provider, modelId);

    // Vercel UIMessage shape is structural and SDK-version-coupled; we deliberately
    // keep our schema loose (z.array(z.unknown())) and cast at this trust boundary
    // rather than duplicate the SDK's evolving type.
    const messagesWithDocState = injectDocumentStateMessages(
      messages as Parameters<typeof injectDocumentStateMessages>[0]
    );
    log.info(
      `[DocsAI] Messages after doc state injection: ${messagesWithDocState.length} messages`
    );

    const tools = toolDefinitionsToToolSet(
      toolDefinitions as Parameters<typeof toolDefinitionsToToolSet>[0]
    );

    log.info(`[DocsAI] Streaming response with ${Object.keys(tools).length} tools`);

    // Set SSE headers up-front. pipeUIMessageStreamToResponse also sets these,
    // but setting them here ensures they are applied even if the pipe is mocked
    // in tests and keeps behavior explicit for downstream proxies.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const referenceContentSection = referenceContent?.trim()
      ? `\n\nADDITIONAL CONTEXT — CHAT-PROVIDED REFERENCE CONTENT:
The docs-chat panel has forwarded the following content (the assistant's prior reply in the chat). When the user's instruction references it (e.g. "insert this", "füge dies ein", "im dokument einfügen", "übernimm das"), use this content as the source for the operation.

CRITICAL RULES for handling this reference content:
1. Insert it IN FULL. Include EVERY section: Antragstellende, Antragstext, Begründung, sub-points, lists, conclusions — everything. Do NOT cherry-pick, do NOT summarize, do NOT shorten.
2. Preserve the original structure: headings stay headings, lists stay lists, paragraphs stay paragraphs. Map elements to BlockNote markdown (#, ##, ###, paragraphs, -, 1., >).
3. Insert ONLY the content itself. Do NOT include this surrounding instruction text, the "ADDITIONAL CONTEXT" header, the "<reference_content>" tags, or any meta-commentary about what you're doing.
4. Drop conversational chrome from the reference: closing questions to the user ("Passt das so?", "Soll ich noch etwas anpassen?"), self-referential meta ("Hier ist der überarbeitete Antrag…", "Warum das überzeugt: ✅ …"), and chat-style emoji bullets that aren't part of the document content. Keep the substantive document body.
5. Only deviate from "insert in full" if the user's instruction explicitly limits scope (e.g. "nur die Begründung einfügen", "ersetze nur den Titel mit …").

<reference_content>
${referenceContent.trim()}
</reference_content>`
      : '';

    const result = streamText({
      model,
      system:
        docsAiFormat.systemPrompt + '\n\n' + BLOCKNOTE_TOOL_STRICT_PROMPT + referenceContentSection,
      messages: await convertToModelMessages(messagesWithDocState),
      tools,
      toolChoice: 'auto',
      // 32k output budget: the prior 4k cap silently truncated mid-tool-call
      // on long inserts (a full Antrag with Antragstellende + multi-item
      // Antragstext + Begründung + sub-sections, serialized as JSON-escaped
      // applyDocumentOperations args, can run several thousand tokens). 32k
      // leaves comfortable headroom even for very long documents; you only
      // pay for tokens actually generated.
      maxOutputTokens: 32768,
      maxRetries: 1,
      temperature: 0.3,
      onFinish: ({ toolCalls, text, finishReason, usage }) => {
        log.info(
          `[DocsAI] Stream finished for doc ${documentId} — reason: ${finishReason}, toolCalls: ${toolCalls?.length || 0}, text length: ${text?.length || 0}`
        );
        if (toolCalls?.length) {
          toolCalls.forEach((tc, i) => {
            const serializedArgs = JSON.stringify(tc.input);
            log.info(
              `[DocsAI]   Tool[${i}]: ${tc.toolName}, args size: ${serializedArgs.length}, args: ${serializedArgs}`
            );
          });
        } else {
          log.warn(
            `[DocsAI] NO tool calls in response (finishReason: ${finishReason}, text length: ${text?.length || 0})`
          );
        }
        if (usage) {
          log.info(`[DocsAI] Tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}`);
        }
      },
      onError: ({ error }) => {
        log.error('[DocsAI] Stream error:', error);
      },
    });

    pipeUiStreamToExpress(result, res);
  } catch (error) {
    log.error('[DocsAI] Error processing AI request:', error);
    return res.status(500).json({
      error: 'AI processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

router.post(
  '/ai',
  rateLimitMiddleware('docs_ai', { autoIncrement: true }),
  validateBody(aiRequestBodySchema),
  handleAiRequest
);

/**
 * Bridge an `ai`-SDK streamText() result onto an Express Response.
 *
 * The Vercel AI SDK takes a Node `ServerResponse`, while Express types its
 * `Response` as a stricter superset. Both are the same object at runtime, so
 * `as unknown as` is required to satisfy TS. Centralizing the cast in this
 * single function:
 *  - Names the trust boundary (Express ↔ Node ↔ AI SDK) for readers.
 *  - Documents the wire contract — the SDK emits `data: <UIMessageChunk-JSON>\n\n`
 *    SSE frames followed by a `[DONE]` sentinel, matching the format that
 *    DefaultChatTransport's EventSourceParserStream expects on the frontend.
 *  - Gives a single grep target if we ever need to swap the underlying writer.
 */
function pipeUiStreamToExpress(result: ReturnType<typeof streamText>, res: Response): void {
  result.pipeUIMessageStreamToResponse(res as unknown as ServerResponse);
}

export default router;
