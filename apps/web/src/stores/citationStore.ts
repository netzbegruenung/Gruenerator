import { create } from 'zustand';

import apiClient from '../components/utils/apiClient';

interface Citation {
  index?: number | string;
  title?: string;
  url?: string;
  source_url?: string;
  source?: string;
  content?: string;
  cited_text?: string;
  document_title?: string;
  similarity_score?: number;
  document_id?: string;
  chunk_index?: number;
  collection_id?: string;
  collection_name?: string;
  [key: string]: unknown;
}

interface ContextChunk {
  text: string;
  chunkIndex: number;
  isCenter: boolean;
}

interface ChunkContextData {
  documentId: string;
  centerChunkIndex: number;
  centerChunk: { text: string; chunkIndex: number };
  contextChunks: ContextChunk[];
}

export interface LinkConfig {
  type: 'none' | 'vectorDocument' | 'external';
  basePath?: string;
  linkKey?: string;
  titleKey?: string;
  urlKey?: string;
}

interface CitationState {
  selectedCitation: Citation | null;
  contextData: ChunkContextData | null;
  isLoadingContext: boolean;
  contextError: string | null;
  linkConfig: LinkConfig;

  setSelectedCitation: (citation: Citation | null, linkConfig?: LinkConfig) => void;
  closeCitationModal: () => void;
  isModalOpen: () => boolean;
  fetchChunkContext: (
    documentId: string,
    chunkIndex: number,
    citation: Citation,
    linkConfig?: LinkConfig
  ) => Promise<void>;
  clearContext: () => void;

  // Centralized linking helpers
  getDocumentUrl: (citation: Citation) => string | null;
  getExternalUrl: (citation: Citation) => string | null;
  getSystemSourceUrl: (citation: Citation) => string | null;
  getNavigationUrl: (citation: Citation) => { url: string; isExternal: boolean } | null;
  canNavigate: () => boolean;
}

const DEFAULT_LINK_CONFIG: LinkConfig = { type: 'none' };

const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// System collections don't have viewable document pages (they link to external sources)
const SYSTEM_COLLECTIONS = [
  'grundsatz',
  'grundsatz-system',
  'grundsatz_documents',
  'gruene_de',
  'gruene_de_documents',
  'gruene_at',
  'gruene_at_documents',
  'bundestag',
  'bundestag_content',
  'boell',
  'boell_stiftung',
  'boell_stiftung_documents',
  'kommunalwiki',
  'kommunalwiki_documents',
  'oparl',
  'oparl_papers',
  'satzungen',
  'satzungen_documents',
  'oesterreich',
  'oesterreich_gruene_documents',
];

// Fallback URLs for known official documents (used when source_url is missing from Qdrant)
const KNOWN_DOCUMENT_URLS: Record<string, string> = {
  // Human-readable patterns
  'Gruenes-Grundsatzprogramm': 'https://www.gruene.de/grundsatzprogramm',
  Grundsatzprogramm: 'https://www.gruene.de/grundsatzprogramm',
  'EU-Wahlprogramm-2024': 'https://www.gruene.de/artikel/europawahlprogramm-2024',
  'Regierungsprogramm-2025': 'https://www.gruene.de/artikel/regierungsprogramm-2025',
  // Actual file-based document IDs from Qdrant
  '20200125_Grundsatzprogramm': 'https://www.gruene.de/grundsatzprogramm',
  '20250318_Regierungsprogramm_DIGITAL_DINA5':
    'https://www.gruene.de/artikel/regierungsprogramm-2025',
  '20240306_Reader_EU-Wahlprogramm2024_A4': 'https://www.gruene.de/artikel/europawahlprogramm-2024',
};

const getKnownDocumentUrl = (citation: Citation): string | null => {
  const docId = citation.document_id as string | undefined;
  const title = citation.document_title as string | undefined;

  if (docId && KNOWN_DOCUMENT_URLS[docId]) return KNOWN_DOCUMENT_URLS[docId];
  if (title && KNOWN_DOCUMENT_URLS[title]) return KNOWN_DOCUMENT_URLS[title];

  // Partial match for flexible document IDs
  for (const [key, url] of Object.entries(KNOWN_DOCUMENT_URLS)) {
    if (docId?.includes(key) || title?.includes(key)) return url;
  }
  return null;
};

const isSystemCollection = (collectionId: string | undefined): boolean => {
  if (!collectionId) return false;
  return SYSTEM_COLLECTIONS.some((c) => collectionId.toLowerCase().includes(c));
};

const useCitationStore = create<CitationState>((set, get) => ({
  selectedCitation: null,
  contextData: null,
  isLoadingContext: false,
  contextError: null,
  linkConfig: DEFAULT_LINK_CONFIG,

  setSelectedCitation: (citation, linkConfig) =>
    set({
      selectedCitation: citation,
      linkConfig: linkConfig || DEFAULT_LINK_CONFIG,
    }),

  closeCitationModal: () =>
    set({
      selectedCitation: null,
      contextData: null,
      contextError: null,
      linkConfig: DEFAULT_LINK_CONFIG,
    }),

  isModalOpen: () => !!get().selectedCitation,

  fetchChunkContext: async (documentId, chunkIndex, citation, linkConfig) => {
    set({
      selectedCitation: citation,
      linkConfig: linkConfig || DEFAULT_LINK_CONFIG,
      isLoadingContext: true,
      contextError: null,
      contextData: null,
    });

    try {
      const collection = citation.collection_id || 'user';
      const response = await apiClient.get(`/documents/qdrant/${documentId}/chunk-context`, {
        params: { chunkIndex, window: 2, collection },
      });

      if (response.data?.success && response.data?.data) {
        set({ contextData: response.data.data, isLoadingContext: false });
      } else {
        set({
          contextError: response.data?.message || 'Kontext konnte nicht geladen werden',
          isLoadingContext: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden des Kontexts';
      set({ contextError: message, isLoadingContext: false });
    }
  },

  clearContext: () =>
    set({
      contextData: null,
      contextError: null,
      isLoadingContext: false,
    }),

  // Centralized: Get internal document URL based on linkConfig
  // Returns null for system collections (they don't have viewable pages)
  getDocumentUrl: (citation) => {
    const { linkConfig } = get();
    if (linkConfig.type !== 'vectorDocument') return null;

    // System collection documents don't have dedicated view pages
    if (isSystemCollection(citation.collection_id as string | undefined)) return null;

    const linkKey = linkConfig.linkKey || 'document_id';
    const documentId = citation[linkKey] as string | undefined;

    // Only user documents (with valid UUIDs) can be opened
    if (!documentId || !isValidUUID(documentId)) return null;

    const basePath = linkConfig.basePath || '/documents';
    return `${basePath}/${documentId}`;
  },

  // Centralized: Get external URL from citation (handles both 'url' and 'source_url' keys)
  getExternalUrl: (citation) => {
    const { linkConfig } = get();
    if (linkConfig.type !== 'external') return null;

    const urlKey = linkConfig.urlKey || 'url';
    // Check both the configured key and common alternatives
    return (citation[urlKey] as string) || citation.source_url || citation.url || null;
  },

  // Get source_url for system collections (grundsatz, bundestag, etc.)
  // Falls back to known document URLs for official documents without source_url
  getSystemSourceUrl: (citation) => {
    if (!isSystemCollection(citation.collection_id as string | undefined)) return null;
    return citation.source_url || citation.url || getKnownDocumentUrl(citation) || null;
  },

  // Unified navigation helper - returns URL and whether it's external
  getNavigationUrl: (citation) => {
    const { linkConfig } = get();

    // Priority 1: If linkConfig is external, use external URL
    if (linkConfig.type === 'external') {
      const url = get().getExternalUrl(citation);
      return url ? { url, isExternal: true } : null;
    }

    // Priority 2: If vectorDocument config
    if (linkConfig.type === 'vectorDocument') {
      // For user documents with valid UUIDs, use internal path
      const internalUrl = get().getDocumentUrl(citation);
      if (internalUrl) {
        return { url: internalUrl, isExternal: false };
      }

      // For system collections, fallback to source_url
      const sourceUrl = get().getSystemSourceUrl(citation);
      if (sourceUrl) {
        return { url: sourceUrl, isExternal: true };
      }
    }

    return null;
  },

  // Centralized: Check if navigation is possible
  canNavigate: () => {
    const { selectedCitation, linkConfig } = get();
    if (!selectedCitation || linkConfig.type === 'none') return false;

    return !!get().getNavigationUrl(selectedCitation);
  },
}));

export default useCitationStore;
