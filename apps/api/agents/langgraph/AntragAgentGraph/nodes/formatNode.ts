import { createLogger } from '../../../../utils/logger.js';
import { formatSourcesBibliography } from '../../PRAgent/utils/responseFormatter.js';
import { COLLECTION_DISPLAY_NAMES } from '../types.js';
import { assembleBackgroundDocument } from '../utils/backgroundDocumentFormatter.js';

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
    // Deduplicate argument sources for the inline citation list
    const seen = new Set<string>();
    const argLines: string[] = [];
    for (const arg of state.arguments) {
      const key = arg.metadata?.url || arg.source;
      if (seen.has(key)) continue;
      seen.add(key);

      const name = COLLECTION_DISPLAY_NAMES[arg.metadata?.collection] || arg.metadata?.collection;
      let line = `- ${arg.source}`;
      if (name) line += ` (${name})`;
      if (arg.metadata?.url) line += ` — [Link](${arg.metadata.url})`;
      argLines.push(line);
    }

    if (argLines.length > 0) {
      sourceParts.push(argLines.join('\n'));
    }
  }

  if (sourceParts.length > 0) {
    formattedOutput += `\n\n---\n\n**Quellen:**\n\n${sourceParts.join('\n\n')}`;
  }

  const backgroundDocument = assembleBackgroundDocument(state);

  log.debug(
    `[formatNode] Output assembled: ${formattedOutput.length} chars, background: ${backgroundDocument.length} chars`
  );
  log.debug(
    `[formatNode] formattedOutput starts with code fence: ${/^[\s]*```/.test(formattedOutput)}, ` +
      `first 200 chars: ${formattedOutput.substring(0, 200).replace(/\n/g, '\\n')}`
  );

  return { formattedOutput, backgroundDocument };
}
