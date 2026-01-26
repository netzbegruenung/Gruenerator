import {
  loadPromptConfig,
  buildConstraints,
  buildRequestContent,
  SimpleTemplateEngine,
} from '../../PromptProcessor.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { PRAgentRequest, SocialPlatformConfig } from '../types.js';

/**
 * Generates content for a specific platform using existing config
 * @param platform - Platform ID (instagram, facebook, pressemitteilung)
 * @param enrichedState - Pre-enriched request with documents, knowledge, etc.
 * @param req - Express request object
 */
export async function generatePlatformContent(
  platform: string,
  enrichedState: EnrichedState,
  req: any
): Promise<string> {
  console.log(`[PR Agent] Generating ${platform} content`);

  try {
    const request = enrichedState.request as PRAgentRequest;
    const socialConfig = loadPromptConfig('social');
    const platformConfig = socialConfig.platforms?.[platform] as SocialPlatformConfig | undefined;

    if (!platformConfig) {
      throw new Error(`Platform config not found: ${platform}`);
    }

    let systemRole = socialConfig.systemRole;
    if (socialConfig.systemRoleExtensions?.[platform]) {
      systemRole += '\n\n' + socialConfig.systemRoleExtensions[platform];
    }

    const constraints = buildConstraints(socialConfig, { platforms: [platform] });

    const requestContent = buildRequestContent(socialConfig, {
      inhalt: request.inhalt,
      platforms: [platform],
      zitatgeber: request.zitatgeber,
      was: request.was,
      wie: request.wie,
    });

    const promptResult = await assemblePromptGraphAsync({
      ...enrichedState,
      systemRole,
      constraints,
      request: requestContent,
      taskInstructions: socialConfig.taskInstructions
        ? SimpleTemplateEngine.render(socialConfig.taskInstructions, { platforms: platform })
        : null,
    });

    const aiResult = await req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'social',
        usePrivacyMode: request.usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: platformConfig.maxLength * 2,
          temperature: socialConfig.options?.temperature || 0.6,
          top_p: platformConfig.top_p || 0.9,
        },
      },
      req
    );

    return aiResult.content || aiResult.data?.content || '';
  } catch (error) {
    console.error(`[PR Agent] Error generating ${platform} content:`, error);
    return `[Fehler bei der Generierung des ${platform} Inhalts]`;
  }
}
