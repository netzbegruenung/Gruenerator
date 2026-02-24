import { createLogger } from '../../../../utils/logger.js';
import { formatSourcesBibliography } from '../../PRAgent/utils/responseFormatter.js';
import { PLATFORM_DISPLAY_NAMES } from '../types.js';

import type { SocialAgentState } from '../types.js';

const log = createLogger('SocialAgent:format');

export async function formatNode(state: SocialAgentState): Promise<Partial<SocialAgentState>> {
  log.debug('[formatNode] Assembling final output');

  const sections: string[] = [];

  if (state.strategy) {
    sections.push(`## Kommunikationsstrategie\n\n${state.strategy}`);
  }

  for (const platform of state.platforms) {
    const content = state.platformContent[platform];
    if (content) {
      const displayName = PLATFORM_DISPLAY_NAMES[platform] || platform;
      sections.push(`## ${displayName}\n\n${content}`);
    }
  }

  if (state.enrichedState?.enrichmentMetadata) {
    const bibliography = formatSourcesBibliography(state.enrichedState.enrichmentMetadata);
    if (bibliography) {
      sections.push(bibliography);
    }
  }

  if (state.arguments.length > 0) {
    const collectionNames: Record<string, string> = {
      grundsatz_documents: 'Grundsatzprogramm',
      bundestag_content: 'Bundestagsfraktion',
      kommunalwiki_documents: 'KommunalWiki',
      gruene_de_documents: 'gruene.de',
      gruene_at_documents: 'gruene.at',
      oesterreich_gruene_documents: 'Grüne Österreich',
    };

    const argLines = state.arguments.slice(0, 5).map((arg) => {
      let line = `- ${arg.source}`;
      if (arg.metadata?.collection) {
        const name = collectionNames[arg.metadata.collection] || arg.metadata.collection;
        line += ` (${name})`;
      }
      return line;
    });

    sections.push(`## Quellen\n\n${argLines.join('\n')}`);
  }

  const formattedOutput = sections.join('\n\n---\n\n');

  log.debug(`[formatNode] Output assembled: ${formattedOutput.length} chars`);

  return { formattedOutput };
}
