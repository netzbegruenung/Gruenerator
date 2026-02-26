import { createSSEStream } from '../../../routes/chat/services/sseHelpers.js';
import { createLogger } from '../../../utils/logger.js';

import {
  antragAgentGraph,
  initializeAntragAgentState,
  runAntragAgentGraph,
} from './AntragAgentGraph.js';
import { REQUEST_TYPE_DISPLAY_NAMES } from './types.js';

import type { AntragAgentInput, AntragRequestType } from './types.js';
import type { Request, Response } from 'express';

const log = createLogger('AntragAgent:processor');

function buildInputFromRequest(req: Request): AntragAgentInput {
  const body = req.body;
  return {
    inhalt: body.inhalt || '',
    requestType: (body.requestType as AntragRequestType) || 'antrag',
    gliederung: body.gliederung || '',
    features: {
      useWebSearchTool: body.useWebSearchTool || false,
      usePrivacyMode: body.usePrivacyMode || false,
      useProMode: body.useProMode || false,
      useUltraMode: body.useUltraMode || false,
    },
    selectedDocumentIds: body.selectedDocumentIds || [],
    selectedTextIds: body.selectedTextIds || [],
    attachments: body.attachments || [],
    searchQuery: body.searchQuery || body.inhalt || '',
    req,
  };
}

export async function processAntragAgentStreaming(req: Request, res: Response): Promise<void> {
  const sse = createSSEStream(res);
  const input = buildInputFromRequest(req);

  if (!input.inhalt) {
    sse.sendRaw('error', { error: 'Inhalt ist erforderlich' });
    sse.end();
    return;
  }

  const requestTypeDisplay = REQUEST_TYPE_DISPLAY_NAMES[input.requestType];
  log.debug(`[agentMode] Starting streaming for ${requestTypeDisplay}`);

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const initialState = initializeAntragAgentState(input);

    sse.sendRaw('progress', {
      stage: 'researching',
      message: 'Recherchiere zum Thema...',
    });

    const stream = await antragAgentGraph.stream(initialState, {
      streamMode: 'updates',
    });

    let fullOutput = '';
    let finalState: any = null;

    for await (const update of stream) {
      if (abortController.signal.aborted) {
        log.debug('[agentMode] Stream aborted by client');
        break;
      }

      for (const [nodeName, nodeOutput] of Object.entries(update)) {
        const output = nodeOutput as Record<string, any>;

        switch (nodeName) {
          case 'research': {
            sse.sendRaw('progress', {
              stage: 'strategizing',
              message: 'Entwickle Argumentationsstrategie...',
            });

            if (output.argumentsSummary) {
              log.debug(
                `[agentMode] Research complete: ${output.arguments?.length || 0} arguments found`
              );
            }
            break;
          }

          case 'strategize': {
            sse.sendRaw('progress', {
              stage: 'generating',
              message: `Erstelle ${requestTypeDisplay}...`,
            });
            break;
          }

          case 'generate': {
            if (output.generatedContent) {
              log.debug(
                `[agentMode] generate text_delta: ${output.generatedContent.length} chars, ` +
                  `starts with fence: ${/^[\s]*```/.test(output.generatedContent)}`
              );
              fullOutput += output.generatedContent;
              sse.sendRaw('text_delta', { text: output.generatedContent });
            }

            sse.sendRaw('progress', {
              stage: 'formatting',
              message: 'Stelle Quellen zusammen...',
            });
            break;
          }

          case 'format': {
            finalState = output;

            if (output.formattedOutput) {
              const suffix = output.formattedOutput.substring(fullOutput.length);
              log.debug(
                `[agentMode] format suffix: ${suffix.length} chars, ` +
                  `fullOutput so far: ${fullOutput.length} chars`
              );
              if (suffix.trim()) {
                fullOutput += suffix;
                sse.sendRaw('text_delta', { text: suffix });
              }
            }

            if (output.backgroundDocument) {
              sse.sendRaw('background_document', { content: output.backgroundDocument });
            }
            break;
          }
        }
      }
    }

    if (!abortController.signal.aborted) {
      const finalContent = fullOutput || finalState?.formattedOutput || '';
      log.debug(
        `[agentMode] Final output: ${finalContent.length} chars, ` +
          `starts with fence: ${/^[\s]*```/.test(finalContent)}, ` +
          `ends with fence: ${/```[\s]*$/.test(finalContent)}, ` +
          `first 300 chars: ${finalContent.substring(0, 300).replace(/\n/g, '\\n')}`
      );
      sse.sendRaw('done', {
        content: finalContent,
        backgroundDocument: finalState?.backgroundDocument || null,
        metadata: {
          requestType: input.requestType,
          strategy: finalState?.strategy || null,
          argumentsFound: finalState?.arguments?.length || 0,
          researchTimeMs: finalState?.researchTimeMs || 0,
          strategyTimeMs: finalState?.strategyTimeMs || 0,
          generationTimeMs: finalState?.generationTimeMs || 0,
        },
      });
    }
  } catch (error: any) {
    log.error('[agentMode] Streaming error:', error);
    if (!abortController.signal.aborted) {
      sse.sendRaw('error', { error: error.message || 'Interner Fehler' });
    }
  } finally {
    sse.end();
  }
}

export async function processAntragAgentRequest(req: Request, res: Response): Promise<void> {
  const input = buildInputFromRequest(req);

  if (!input.inhalt) {
    res.status(400).json({
      success: false,
      error: 'Inhalt ist erforderlich',
    });
    return;
  }

  try {
    const result = await runAntragAgentGraph(input);

    if (result.success) {
      res.json({
        success: true,
        content: result.content,
        backgroundDocument: result.backgroundDocument || null,
        metadata: result.metadata,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Generierung fehlgeschlagen',
        content: result.content,
        backgroundDocument: result.backgroundDocument || null,
        metadata: result.metadata,
      });
    }
  } catch (error: any) {
    log.error('[agentMode] Request error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
}
