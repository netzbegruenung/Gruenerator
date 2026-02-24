import { createLogger } from '../../../../utils/logger.js';
import { formatSourcesBibliography } from '../../PRAgent/utils/responseFormatter.js';

import type { AntragAgentState } from '../types.js';

const log = createLogger('AntragAgent:format');

export async function formatNode(state: AntragAgentState): Promise<Partial<AntragAgentState>> {
  log.debug('[formatNode] Assembling final output');

  let formattedOutput = state.generatedContent || '';

  const sourceParts: string[] = [];

  if (state.enrichedState?.enrichmentMetadata) {
    const bibliography = formatSourcesBibliography(state.enrichedState.enrichmentMetadata);
    if (bibliography) {
      sourceParts.push(bibliography);
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

    sourceParts.push(argLines.join('\n'));
  }

  if (sourceParts.length > 0) {
    formattedOutput += `\n\n---\n\n**Quellen:**\n\n${sourceParts.join('\n\n')}`;
  }

  log.debug(`[formatNode] Output assembled: ${formattedOutput.length} chars`);

  return { formattedOutput };
}
