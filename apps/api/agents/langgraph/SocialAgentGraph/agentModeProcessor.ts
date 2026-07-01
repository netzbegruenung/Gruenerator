import { createSSEStream } from '../../../routes/chat/services/sseHelpers.js';
import { createLogger } from '../../../utils/logger.js';

import {
  socialAgentGraph,
  initializeSocialAgentState,
  runSocialAgentGraph,
} from './SocialAgentGraph.js';
import { PLATFORM_DISPLAY_NAMES } from './types.js';

import type { SocialAgentInput } from './types.js';
import type { Request, Response } from 'express';

interface SocialRequestBody {
  inhalt?: string;
  platforms?: string[];
  zitatgeber?: string | null;
  useWebSearchTool?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
  useUltraMode?: boolean;
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];
  attachments?: unknown[];
  searchQuery?: string;
}

const log = createLogger('SocialAgent:processor');

function buildInputFromRequest(req: Request): SocialAgentInput {
  const body = req.body as SocialRequestBody;
  return {
    inhalt: body.inhalt || '',
    platforms: body.platforms || [],
    zitatgeber: body.zitatgeber || null,
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

export async function processAgentModeStreaming(req: Request, res: Response): Promise<void> {
  const sse = createSSEStream(res);
  const input = buildInputFromRequest(req);

  if (!input.inhalt || input.platforms.length === 0) {
    sse.sendRaw('error', { error: 'Inhalt und mindestens eine Plattform erforderlich' });
    sse.end();
    return;
  }

  log.debug(
    `[agentMode] Starting streaming for ${input.platforms.length} platforms: ` +
      input.platforms.join(', ')
  );

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const initialState = initializeSocialAgentState(input);

    sse.sendRaw('progress', {
      stage: 'researching',
      message: 'Recherchiere zum Thema...',
    });

    const stream = await socialAgentGraph.stream(initialState, {
      streamMode: 'updates',
    });

    let fullOutput = '';
    let finalState: Record<string, unknown> | null = null;

    for await (const update of stream) {
      if (abortController.signal.aborted) {
        log.debug('[agentMode] Stream aborted by client');
        break;
      }

      for (const [nodeName, nodeOutput] of Object.entries(update)) {
        const output = nodeOutput as Record<string, unknown>;

        switch (nodeName) {
          case 'research': {
            sse.sendRaw('progress', {
              stage: 'strategizing',
              message: 'Entwickle Kommunikationsstrategie...',
            });

            if (output.argumentsSummary) {
              log.debug(
                `[agentMode] Research complete: ${(output.arguments as unknown[] | undefined)?.length || 0} arguments found`
              );
            }
            break;
          }

          case 'strategize': {
            if (output.strategy) {
              const strategySection = `## Kommunikationsstrategie\n\n${output.strategy}`;
              fullOutput += strategySection;
              sse.sendRaw('text_delta', { text: strategySection });
            }

            const platformNames = input.platforms
              .map((p) => PLATFORM_DISPLAY_NAMES[p] || p)
              .join(', ');
            sse.sendRaw('progress', {
              stage: 'generating',
              message: `Erstelle Inhalte für ${platformNames}...`,
            });
            break;
          }

          case 'generate': {
            if (output.platformContent) {
              for (const platform of input.platforms) {
                const content = (output.platformContent as Record<string, string>)[platform];
                if (content) {
                  const displayName = PLATFORM_DISPLAY_NAMES[platform] || platform;
                  const section = `\n\n---\n\n## ${displayName}\n\n${content}`;
                  fullOutput += section;
                  sse.sendRaw('text_delta', { text: section });
                }
              }
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
              const currentContentEnd = fullOutput.length;
              const fullFormatted = output.formattedOutput as string;
              if (fullFormatted.length > currentContentEnd) {
                const remaining = fullFormatted.substring(currentContentEnd);
                if (remaining.trim()) {
                  sse.sendRaw('text_delta', { text: remaining });
                  fullOutput = fullFormatted;
                }
              }
            }
            break;
          }

          default:
            break;
        }
      }
    }

    if (!abortController.signal.aborted) {
      sse.sendRaw('done', {
        content: fullOutput || (finalState?.formattedOutput as string) || '',
        metadata: {
          platforms: input.platforms,
          argumentsFound: (finalState?.arguments as unknown[] | undefined)?.length || 0,
          researchTimeMs: finalState?.researchTimeMs || 0,
          strategyTimeMs: finalState?.strategyTimeMs || 0,
          generationTimeMs: finalState?.generationTimeMs || 0,
        },
      });
    }
  } catch (error: unknown) {
    log.error('[agentMode] Streaming error:', error);
    if (!abortController.signal.aborted) {
      sse.sendRaw('error', {
        error: (error instanceof Error ? error.message : String(error)) || 'Interner Fehler',
      });
    }
  } finally {
    sse.end();
  }
}

export async function processAgentModeRequest(req: Request, res: Response): Promise<void> {
  const input = buildInputFromRequest(req);

  if (!input.inhalt || input.platforms.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Inhalt und mindestens eine Plattform erforderlich',
    });
    return;
  }

  try {
    const result = await runSocialAgentGraph(input);

    log.debug(
      `[agentMode] Result: success=${result.success}, contentLength=${result.content.length}, ` +
        `error=${result.error || 'none'}`
    );

    if (result.success) {
      res.json({
        success: true,
        content: result.content,
        metadata: result.metadata,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Generierung fehlgeschlagen',
        content: result.content,
        metadata: result.metadata,
      });
    }
  } catch (error: unknown) {
    log.error('[agentMode] Request error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
}
