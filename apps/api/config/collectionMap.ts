/**
 * Shared Collection Map
 *
 * Maps chat-facing collection names to Qdrant collection names and system IDs.
 * Used by directSearch, the system full-text endpoint, and other services
 * that need to resolve user-facing collection identifiers.
 */

export interface CollectionMapping {
  qdrantCollection: string;
  systemId: string;
}

export const COLLECTION_MAP: Record<string, CollectionMapping> = {
  deutschland: {
    qdrantCollection: 'grundsatz_documents',
    systemId: 'grundsatz-system',
  },
  bundestagsfraktion: {
    qdrantCollection: 'bundestag_content',
    systemId: 'bundestagsfraktion-system',
  },
  kommunalwiki: {
    qdrantCollection: 'kommunalwiki_documents',
    systemId: 'kommunalwiki-system',
  },
  'gruene-de': {
    qdrantCollection: 'gruene_de_documents',
    systemId: 'gruene-de-system',
  },
  'gruene-at': {
    qdrantCollection: 'gruene_at_documents',
    systemId: 'gruene-at-system',
  },
  oesterreich: {
    qdrantCollection: 'oesterreich_gruene_documents',
    systemId: 'oesterreich-gruene-system',
  },
  examples: {
    qdrantCollection: 'social_media_examples',
    systemId: 'examples-system',
  },
  'boell-stiftung': {
    qdrantCollection: 'boell_stiftung_documents',
    systemId: 'boell-stiftung-system',
  },
  gruenblog: {
    qdrantCollection: 'gruenblog_documents',
    systemId: 'gruenblog-system',
  },
  hamburg: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'hamburg-system',
  },
  'schleswig-holstein': {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'schleswig-holstein-system',
  },
  thueringen: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'thueringen-system',
  },
  bayern: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'bayern-system',
  },
  berlin: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'berlin-system',
  },
  'mecklenburg-vorpommern': {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'mecklenburg-vorpommern-system',
  },
};
