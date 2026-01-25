/**
 * MCP Resources for document collections
 * Provides read-only access to collection metadata and documents
 */

import { config } from '../config.ts';
import { getCollectionInfo } from '../qdrant/client.ts';

/**
 * Get all available collections as MCP resources
 */
export async function getCollectionResources() {
  const resources = [];

  for (const [key, col] of Object.entries(config.collections)) {
    try {
      const info = await getCollectionInfo(col.name);

      resources.push({
        uri: `gruenerator://collections/${key}`,
        name: col.displayName,
        description: col.description,
        mimeType: 'application/json',
        metadata: {
          collectionId: key,
          qdrantCollection: col.name,
          pointsCount: info.pointsCount || 0,
          status: info.status || 'unknown',
          filterableFields: col.filterableFields ? Object.keys(col.filterableFields) : [],
        },
      });
    } catch (err) {
      resources.push({
        uri: `gruenerator://collections/${key}`,
        name: col.displayName,
        description: col.description,
        mimeType: 'application/json',
        metadata: {
          collectionId: key,
          qdrantCollection: col.name,
          error: err.message,
        },
      });
    }
  }

  return resources;
}

/**
 * Get a specific collection resource by URI
 */
export async function getCollectionResource(uri) {
  const match = uri.match(/^gruenerator:\/\/collections\/(\w+)$/);
  if (!match) {
    return null;
  }

  const collectionKey = match[1];
  const col = config.collections[collectionKey];

  if (!col) {
    return null;
  }

  try {
    const info = await getCollectionInfo(col.name);

    return {
      uri,
      name: col.displayName,
      mimeType: 'application/json',
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              collection: {
                id: collectionKey,
                displayName: col.displayName,
                description: col.description,
                qdrantCollection: col.name,
              },
              stats: {
                pointsCount: info.pointsCount || 0,
                status: info.status || 'unknown',
              },
              searchModes: ['hybrid', 'vector', 'text'],
              filterableFields: col.filterableFields
                ? Object.entries(col.filterableFields).map(([field, cfg]) => ({
                    field,
                    label: cfg.label,
                    type: cfg.type,
                  }))
                : [],
              features: [
                'Hybrid-Suche (Vector + Text)',
                'Deutsche Umlaut-Unterstützung',
                'Qualitäts-gewichtete Ergebnisse',
                'Semantic Caching',
                'Metadaten-Filter',
                ...(col.filterableFields
                  ? [`Filter: ${Object.keys(col.filterableFields).join(', ')}`]
                  : []),
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      uri,
      name: col.displayName,
      mimeType: 'application/json',
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              error: err.message,
              collection: collectionKey,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

/**
 * Get server info as a resource
 */
function _getServerInfoResource() {
  return {
    uri: 'gruenerator://info',
    name: 'Gruenerator MCP Server Info',
    description: 'Informationen über den MCP Server und seine Fähigkeiten',
    mimeType: 'application/json',
  };
}

/**
 * Read the server info resource
 */
export function readServerInfoResource() {
  return {
    uri: 'gruenerator://info',
    name: 'Gruenerator MCP Server Info',
    mimeType: 'application/json',
    contents: [
      {
        uri: 'gruenerator://info',
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            name: 'Gruenerator MCP Server',
            version: '1.0.0',
            description: 'MCP Server für semantische Suche in Grünen Parteiprogrammen',
            capabilities: {
              searchModes: ['hybrid', 'vector', 'text'],
              collections: Object.keys(config.collections),
              features: [
                'Hybrid-Suche mit RRF-Fusion',
                'Deutsche Textoptimierung',
                'Qualitäts-gewichtete Ergebnisse',
                'Embedding- und Ergebnis-Caching',
                'Metadaten-Filterung',
              ],
            },
            tools: [
              { name: 'gruenerator_search', readOnly: true },
              { name: 'gruenerator_get_filters', readOnly: true },
              { name: 'gruenerator_cache_stats', readOnly: true },
              { name: 'gruenerator_person_search', readOnly: true },
              { name: 'gruenerator_examples_search', readOnly: true },
              { name: 'get_client_config', readOnly: true },
            ],
          },
          null,
          2
        ),
      },
    ],
  };
}
