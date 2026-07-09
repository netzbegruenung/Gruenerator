import dotenv from 'dotenv';

import { getCatalog, type McpCatalog } from './catalog.ts';

dotenv.config();

export const config = {
  server: {
    publicUrl: process.env.PUBLIC_URL || null,
  },

  qdrant: {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    basicAuth: {
      username: process.env.QDRANT_BASIC_AUTH_USERNAME,
      password: process.env.QDRANT_BASIC_AUTH_PASSWORD,
    },
  },

  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
  },

  api: {
    url: process.env.GRUENERATOR_API_URL || null,
  },

  // Runtime collection catalog — fetched from the backend with a static fallback
  // (see catalog.ts). A getter so every read reflects the latest fetched catalog.
  get collections(): McpCatalog {
    return getCatalog();
  },
};

export function validateConfig() {
  if (!config.qdrant.url) {
    throw new Error('QDRANT_URL ist nicht gesetzt');
  }

  const hasApiKey = !!config.qdrant.apiKey;
  const hasBasicAuth = config.qdrant.basicAuth.username && config.qdrant.basicAuth.password;

  if (!hasApiKey && !hasBasicAuth) {
    throw new Error(
      'Qdrant Auth fehlt: Setze QDRANT_API_KEY oder QDRANT_BASIC_AUTH_USERNAME + QDRANT_BASIC_AUTH_PASSWORD'
    );
  }

  if (!config.mistral.apiKey) {
    throw new Error('MISTRAL_API_KEY ist nicht gesetzt');
  }
}
