import { createLogger } from '../../../../utils/logger.js';
import { generatePlatformContent } from '../../PRAgent/generators/platformGenerator.js';

import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { SocialAgentState } from '../types.js';

const log = createLogger('SocialAgent:generate');

export async function generateNode(state: SocialAgentState): Promise<Partial<SocialAgentState>> {
  const startTime = Date.now();
  log.debug(`[generateNode] Generating content for ${state.platforms.length} platforms`);

  if (!state.enrichedState) {
    log.error('[generateNode] No enriched state, cannot generate');
    return {
      platformContent: {},
      generationTimeMs: Date.now() - startTime,
      error: 'Keine angereicherten Daten für die Generierung verfügbar',
    };
  }

  const enrichedWithStrategy: EnrichedState = {
    ...state.enrichedState,
    knowledge: [
      ...state.enrichedState.knowledge,
      ...(state.strategy ? [`Kommunikationsstrategie (bitte befolgen):\n${state.strategy}`] : []),
      ...(state.researchContext ? [`Recherche-Kontext:\n${state.researchContext}`] : []),
    ],
  };

  const results = await Promise.all(
    state.platforms.map(async (platform) => {
      try {
        const content = await generatePlatformContent(platform, enrichedWithStrategy, state.req);
        log.debug(`[generateNode] ${platform} content generated`);
        return { platform, content };
      } catch (error) {
        log.error(`[generateNode] ${platform} generation failed:`, error);
        return {
          platform,
          content: `[Fehler bei der Generierung des ${platform} Inhalts]`,
        };
      }
    })
  );

  const platformContent: Record<string, string> = {};
  for (const { platform, content } of results) {
    platformContent[platform] = content;
  }

  const generationTimeMs = Date.now() - startTime;
  log.debug(
    `[generateNode] All platforms generated in ${generationTimeMs}ms: ` +
      `${Object.keys(platformContent).join(', ')}`
  );

  return {
    platformContent,
    generationTimeMs,
  };
}
