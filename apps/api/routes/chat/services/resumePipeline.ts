/**
 * Resume handler for the chat-graph `resume` endpoint.
 *
 * Restores the stored pipeline state after a clarification interrupt and
 * finishes the turn — either by regenerating a sharepic (the answer is the
 * topic) or by running search + response generation for non-sharepic intents.
 */

import { computePayloadSchema, type chatGraphContract } from '@gruenerator/contracts';

import {
  buildSystemMessage,
  briefGeneratorNode,
  pandasComputeNode,
  searchNode,
  rerankNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { isReasoningStreamModel } from '../../../services/ai/regoloReasoningStream.js';
import { getAIWorkerPool } from '../../../utils/getAIWorkerPool.js';
import { createLogger } from '../../../utils/logger.js';

import { pruneMessages } from './contextPruningService.js';
import { executeIntentPipeline } from './intentExecutionService.js';
import { extractTextContent } from './messageHelpers.js';
import { pipelineStateStore } from './pipelineStateStore.js';
import { persistResumedResponse } from './postResponseService.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamForResolution,
  streamWithFallback,
} from './responseStreamingService.js';
import { resolveResumeInput } from './resumeInput.js';
import {
  type createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
  sseFail,
} from './sseHelpers.js';
import { getUser } from './threadPersistenceService.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ServerInferRequest } from '@ts-rest/core';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

type ResumeBody = ServerInferRequest<typeof chatGraphContract.resume>['body'];
type SSEStream = ReturnType<typeof createSSEStream>;

export async function runChatGraphResume({
  req,
  body,
  sse,
}: {
  req: Request;
  body: ResumeBody;
  sse: SSEStream;
}): Promise<{ status: 200; body: undefined }> {
  const _requestId = `resume_${Date.now()}`;
  log.info('[chatGraphContract] resume handler entered, request_id=%s', _requestId);

  try {
    const { threadId } = body;
    const resumeInput = resolveResumeInput(body);
    if (!resumeInput) {
      return sseFail(sse, 'Ungültige Resume-Anfrage.');
    }
    if (resumeInput.kind === 'client_tool' && resumeInput.toolName !== 'run_python') {
      return sseFail(sse, 'Dieser Tool-Typ wird noch nicht unterstützt.');
    }
    const userAnswer = resumeInput.kind === 'ask_human' ? resumeInput.answer : null;

    const user = getUser(req);
    if (!user?.id) {
      return sseFail(sse, PROGRESS_MESSAGES.unauthorized);
    }

    const stored = await pipelineStateStore.get(threadId);
    if (!stored) {
      return sseFail(sse, 'Pipeline-Status abgelaufen. Bitte sende deine Nachricht erneut.');
    }
    await pipelineStateStore.delete(threadId);

    const { classifiedState, requestContext } = stored;

    if (requestContext.userId !== user.id) {
      return sseFail(sse, PROGRESS_MESSAGES.unauthorized);
    }

    const aiWorkerPool = getAIWorkerPool(req);
    if (!aiWorkerPool) {
      return sseFail(sse, PROGRESS_MESSAGES.aiUnavailable);
    }

    log.info(
      `[ChatGraph:Resume] Thread ${threadId}, ${
        resumeInput.kind === 'ask_human'
          ? `answer: "${(userAnswer ?? '').slice(0, 80)}"`
          : `client tool: ${resumeInput.toolName}`
      }`
    );

    classifiedState.needsClarification = false;
    classifiedState.clarificationQuestion = null;
    classifiedState.clarificationOptions = null;

    if (resumeInput.kind === 'ask_human') {
      classifiedState.searchQuery = userAnswer;
    } else {
      // run_python result: validate the browser-computed payload and seed it as
      // ground truth for respondNode (formatComputedResultContext). The
      // `compute` SSE event drives the inline "Berechnung" card.
      const parsed = computePayloadSchema.safeParse(resumeInput.result);
      // A "successful" run can still be semantically broken: nan/empty values
      // (wrong column, missing dropna — beta: "Produkt mit höchstem Gewinn:
      // nan") take the correction round too. A figure-only run legitimately has
      // an empty text entry — figures count as a real result.
      const NANISH_VALUE = /^(nan|nat|none|null)?$/i;
      const hasNanValues =
        parsed.success &&
        !parsed.data.figures?.length &&
        parsed.data.entries.some((e) => NANISH_VALUE.test(e.value.trim()));
      if (parsed.success && !hasNanValues) {
        classifiedState.computedResult = parsed.data;
        classifiedState.computedResultFresh = true;
        sse.send('compute', { compute: parsed.data });
      } else {
        const errorText = parsed.success
          ? `Der Code lief durch, aber das Ergebnis enthält nan/leere Werte — vermutlich falsche Spaltenwahl oder fehlendes dropna(). Ausgabe: ${parsed.data.summary.slice(0, 300)}`
          : resumeInput.result != null &&
              typeof resumeInput.result === 'object' &&
              'error' in resumeInput.result
            ? String((resumeInput.result as { error: unknown }).error)
            : 'invalid payload';
        log.warn(`[ChatGraph:Resume] run_python failed client-side: ${errorText.slice(0, 200)}`);

        // Error-correction round (OpenWebUI-style, bounded to 1 retry): give
        // the codegen model the failed code + error message and pause the turn
        // again — the client executes the corrected code and resumes. If the
        // retry budget is spent or codegen declines, fall through to a normal
        // respond without computedResult (legacy prompt-guidance fallback).
        const retries = classifiedState.pandasComputeRetries ?? 0;
        if (retries < 1) {
          classifiedState.aiWorkerPool = aiWorkerPool;
          const { pythonCode } = await pandasComputeNode(classifiedState, {
            ...(classifiedState.pandasLastCode != null && {
              previousCode: classifiedState.pandasLastCode,
            }),
            previousError: errorText,
          });
          if (pythonCode) {
            classifiedState.pandasComputeRetries = retries + 1;
            classifiedState.pandasLastCode = pythonCode;
            log.info(`[ChatGraph:Resume] run_python correction round (${pythonCode.length} chars)`);

            sse.sendRaw('thinking_step', {
              stepId: `run_python_retry_${Date.now()}`,
              toolName: 'run_python',
              title: 'Korrigiere Berechnung…',
              status: 'in_progress',
              args: { code: pythonCode },
            });
            sse.send('interrupt', {
              interruptType: 'client_tool',
              toolName: 'run_python',
              args: { code: pythonCode },
              threadId,
            });
            await pipelineStateStore.store(threadId, { classifiedState, requestContext });
            sse.send('done', {
              threadId,
              citations: [],
              interrupted: true,
              metadata: {
                intent: classifiedState.intent,
                searchCount: 0,
                totalTimeMs: Date.now() - (classifiedState.startTime || Date.now()),
                searchTimeMs: 0,
              },
            });
            sse.end();
            return { status: 200 as const, body: undefined };
          }
        }
        // Correction budget spent or codegen declined: if the payload itself
        // was valid (nan case), still hand it to the model — an answer that
        // names the nan beats silently dropping the computation.
        if (parsed.success) {
          classifiedState.computedResult = parsed.data;
          classifiedState.computedResultFresh = true;
          sse.send('compute', { compute: parsed.data });
        }
      }
    }

    const startTime = Date.now();

    // === Sharepic resume: the answer is the topic — regenerate and finish ===
    if (classifiedState.intent === 'sharepic') {
      // Combine the original (topic-less) request with the answer so any variant
      // hint ("zitat sharepic") survives and the answer supplies the subject.
      const prevUserMsg = [...classifiedState.messages].reverse().find((m) => m.role === 'user');
      const prevText = prevUserMsg ? extractTextContent(prevUserMsg.content) : '';
      const combined = `${prevText} ${userAnswer}`.trim();
      classifiedState.messages = [...classifiedState.messages, { role: 'user', content: combined }];

      sse.send('intent', {
        intent: 'sharepic',
        message: getIntentMessage('sharepic'),
        reasoning: `Resumed: ${userAnswer}`,
      });

      const { sharepicVariants } = await executeIntentPipeline({
        classifiedState,
        sse,
        forcedTool: requestContext.forcedTool,
        ...(requestContext.enabledTools != null && { enabledTools: requestContext.enabledTools }),
        imageAttachments: requestContext.imageAttachments ?? [],
        req,
      });

      const n = sharepicVariants.length;
      const fullText =
        n > 0
          ? `Ich habe dir ${n} Sharepic-${n === 1 ? 'Variante' : 'Varianten'} erstellt. ` +
            `Wähle eine aus oder sag mir, was ich am Text oder Bild anpassen soll.`
          : `Die Sharepic-Erstellung hat leider nicht geklappt. Magst du es mit einem ` +
            `anderen Thema noch einmal versuchen?`;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      sse.send('text_delta', { text: fullText });

      await persistResumedResponse({
        threadId: requestContext.actualThreadId!,
        fullText,
        finalState: classifiedState,
        classifiedState,
        userId: requestContext.userId,
        processedMeta: requestContext.processedMeta,
      });

      sse.send('done', {
        ...(requestContext.actualThreadId != null && {
          threadId: requestContext.actualThreadId,
        }),
        citations: [],
        metadata: {
          intent: 'sharepic',
          searchCount: 0,
          totalTimeMs: Date.now() - startTime,
          searchTimeMs: 0,
        },
      });
      sse.end();
      return { status: 200 as const, body: undefined };
    }

    const nonSearchIntents = new Set(['direct', 'image', 'image_edit']);
    if (resumeInput.kind === 'ask_human' && nonSearchIntents.has(classifiedState.intent)) {
      classifiedState.intent = 'search';
    }

    sse.send('intent', {
      intent: classifiedState.intent,
      message: getIntentMessage(classifiedState.intent),
      reasoning: `Resumed: ${resumeInput.kind === 'ask_human' ? userAnswer : resumeInput.toolName}`,
      ...(classifiedState.searchQuery != null && { searchQuery: classifiedState.searchQuery }),
      ...(classifiedState.subQueries != null && { subQueries: classifiedState.subQueries }),
      ...(classifiedState.searchSources?.length && {
        searchSources: classifiedState.searchSources,
      }),
    });

    // === Search ===
    // Client-tool resumes (run_python) skip search entirely: the answer needs
    // only the computed result + the already-injected attachment context.
    let finalState = classifiedState;
    const { enabledTools, modelId, forcedTool } = requestContext;

    if (resumeInput.kind === 'ask_human' && !nonSearchIntents.has(classifiedState.intent)) {
      const toolEnabled = forcedTool || enabledTools?.[classifiedState.intent] !== false;
      if (toolEnabled) {
        let searchInputState = classifiedState;
        if (classifiedState.complexity === 'complex' && classifiedState.intent === 'research') {
          const briefResult = await briefGeneratorNode(classifiedState);
          searchInputState = { ...classifiedState, ...briefResult } as ChatGraphState;
        }

        sse.send('search_start', { message: PROGRESS_MESSAGES.searchStart });
        const searchResult = await searchNode(searchInputState);
        finalState = { ...searchInputState, ...searchResult } as ChatGraphState;

        if (finalState.searchResults?.length > 3) {
          const rerankResult = await rerankNode(finalState);
          finalState = { ...finalState, ...rerankResult } as ChatGraphState;
          if (finalState.searchResults.length > 0) {
            finalState.citations = buildCitations(finalState.searchResults);
          }
        }

        const resultCount = finalState.searchResults?.length || 0;
        sse.send('search_complete', {
          message: PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results:
            finalState.searchResults?.slice(0, 10).map((r) => {
              const result: {
                source: string;
                title: string;
                content: string;
                url?: string;
                relevance?: number;
              } = {
                source: r.source,
                title: r.title,
                content: r.content,
              };
              if (r.url != null) result.url = r.url;
              if (r.relevance != null) result.relevance = r.relevance;
              return result;
            }) ?? [],
          ...((classifiedState.intent === 'examples' ||
            classifiedState.intent === 'pressemitteilung_examples') &&
          finalState.examplesResult
            ? { examplesResult: finalState.examplesResult }
            : {}),
        });
      }
    }

    // === Response ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = await buildSystemMessage(finalState);
    const resumeImageAttachments = requestContext.imageAttachments ?? [];
    const agentConfigForResolve2 = {
      provider: finalState.agentConfig.provider as string,
      model: finalState.agentConfig.model,
      ...(finalState.agentConfig.defaultModel != null && {
        defaultModel: finalState.agentConfig.defaultModel,
      }),
    };
    const resumeRequestId = `resume_contract_${Date.now()}`;
    const resolution2 = await resolveModel(agentConfigForResolve2, modelId, resumeRequestId, {
      hasImages: resumeImageAttachments.length > 0,
      intent: finalState.intent,
    });
    if (resolution2.unknownModelId) {
      sse.send('warning', {
        code: 'unknown_model_id',
        message: `Modell "${resolution2.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
      });
    }
    const validMessages = requestContext.validMessages;
    const prunedValidMessages = pruneMessages(validMessages);
    const messagesForAI = buildMessagesForAI(systemMessage, prunedValidMessages);

    const baseMaxTokens = finalState.agentConfig.params.max_tokens;

    let fullText: string | null;
    try {
      fullText = await streamWithFallback({
        primary: resolution2,
        sse,
        logPrefix: '[ChatGraph:Resume]',
        buildStream: async (r) => {
          const isReasoning = isReasoningStreamModel(r.provider, r.modelName);
          return streamForResolution({
            resolution: r,
            messages: messagesForAI,
            maxTokens: isReasoning ? Math.max(baseMaxTokens, 16000) : Math.max(baseMaxTokens, 8000),
            temperature: finalState.agentConfig.params.temperature,
            sse,
            logPrefix: '[ChatGraph:Resume]',
          });
        },
      });
    } finally {
      if (resolution2.releaseSlot) await resolution2.releaseSlot();
    }

    if (fullText === null) return { status: 200 as const, body: undefined };

    // === Persist & complete ===
    await persistResumedResponse({
      threadId: requestContext.actualThreadId!,
      fullText,
      finalState,
      classifiedState,
      userId: requestContext.userId,
      processedMeta: requestContext.processedMeta,
    });

    const totalTimeMs = Date.now() - startTime;
    sse.send('done', {
      ...(requestContext.actualThreadId != null && { threadId: requestContext.actualThreadId }),
      citations: finalState.citations,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        ...(classifiedState.classificationTimeMs != null && {
          classificationTimeMs: classifiedState.classificationTimeMs,
        }),
        ...(finalState.searchTimeMs != null && { searchTimeMs: finalState.searchTimeMs }),
      },
    });

    log.info(`[ChatGraph:Resume] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
    sse.end();
    return { status: 200 as const, body: undefined };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error(`[ChatGraph:Resume] Controller error: ${errorMessage}`);
    if (errorStack) log.error(`[ChatGraph:Resume] Stack: ${errorStack}`);
    if (!sse.isEnded()) {
      sse.send('error', { error: PROGRESS_MESSAGES.internalError });
      sse.end();
    }
    return { status: 200 as const, body: undefined };
  }
}
