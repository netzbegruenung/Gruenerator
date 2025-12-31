import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    publicUrl: process.env.PUBLIC_URL || null
  },

  qdrant: {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    basicAuth: {
      username: process.env.QDRANT_BASIC_AUTH_USERNAME,
      password: process.env.QDRANT_BASIC_AUTH_PASSWORD
    }
  },

  mistral: {
    apiKey: process.env.MISTRAL_API_KEY
  },

  collections: {
    oesterreich: {
      name: 'oesterreich_gruene_documents',
      displayName: 'Die Grünen Österreich',
      description: 'EU-Wahlprogramm, Grundsatzprogramm, Nationalratswahl-Programm',
      filterableFields: {
        primary_category: { label: 'Programm', type: 'keyword' }
      }
    },
    deutschland: {
      name: 'grundsatz_documents',
      displayName: 'Bündnis 90/Die Grünen',
      description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
      filterableFields: {
        primary_category: { label: 'Programm', type: 'keyword' }
      }
    },
    bundestagsfraktion: {
      name: 'bundestag_content',
      displayName: 'Grüne Bundestagsfraktion',
      description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
      filterableFields: {
        primary_category: { label: 'Bereich', type: 'keyword' },
        country: { label: 'Land', type: 'keyword' }
      }
    },
    'gruene-de': {
      name: 'gruene_de_documents',
      displayName: 'Grüne Deutschland (gruene.de)',
      description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
      filterableFields: {
        primary_category: { label: 'Bereich', type: 'keyword' },
        country: { label: 'Land', type: 'keyword' }
      }
    },
    'gruene-at': {
      name: 'gruene_at_documents',
      displayName: 'Grüne Österreich (gruene.at)',
      description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
      filterableFields: {
        primary_category: { label: 'Bereich', type: 'keyword' },
        country: { label: 'Land', type: 'keyword' }
      }
    },
    kommunalwiki: {
      name: 'kommunalwiki_documents',
      displayName: 'KommunalWiki',
      description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
      filterableFields: {
        content_type: { label: 'Artikeltyp', type: 'keyword' },
        primary_category: { label: 'Kategorie', type: 'keyword' },
        subcategories: { label: 'Unterkategorien', type: 'keyword' }
      }
    },
    'boell-stiftung': {
      name: 'boell_stiftung_documents',
      displayName: 'Heinrich-Böll-Stiftung',
      description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
      filterableFields: {
        content_type: { label: 'Inhaltstyp', type: 'keyword' },
        primary_category: { label: 'Thema', type: 'keyword' },
        subcategories: { label: 'Unterkategorien', type: 'keyword' },
        region: { label: 'Region', type: 'keyword' }
      }
    }
  }
};

export function validateConfig() {
  if (!config.qdrant.url) {
    throw new Error('QDRANT_URL ist nicht gesetzt');
  }

  const hasApiKey = !!config.qdrant.apiKey;
  const hasBasicAuth = config.qdrant.basicAuth.username && config.qdrant.basicAuth.password;

  if (!hasApiKey && !hasBasicAuth) {
    throw new Error('Qdrant Auth fehlt: Setze QDRANT_API_KEY oder QDRANT_BASIC_AUTH_USERNAME + QDRANT_BASIC_AUTH_PASSWORD');
  }

  if (!config.mistral.apiKey) {
    throw new Error('MISTRAL_API_KEY ist nicht gesetzt');
  }
}
