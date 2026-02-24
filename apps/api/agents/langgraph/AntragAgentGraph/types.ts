import type { EnrichedState, EnrichmentMetadata } from '../../../utils/types/requestEnrichment.js';
import type { ArgumentResult } from '../PRAgent/generators/argumentsGenerator.js';

export type AntragRequestType = 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';

export interface AntragAgentInput {
  inhalt: string;
  requestType: AntragRequestType;
  gliederung: string;
  features: {
    useWebSearchTool: boolean;
    usePrivacyMode: boolean;
    useProMode: boolean;
    useUltraMode: boolean;
  };
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  attachments: unknown[];
  searchQuery: string;
  req: any;
}

export interface AntragAgentState {
  // Input
  inhalt: string;
  requestType: AntragRequestType;
  gliederung: string;
  features: {
    useWebSearchTool: boolean;
    usePrivacyMode: boolean;
    useProMode: boolean;
    useUltraMode: boolean;
  };
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  attachments: unknown[];
  searchQuery: string;
  req: any;

  // Research output
  enrichedState: EnrichedState | null;
  arguments: ArgumentResult[];
  argumentsSummary: string | null;
  researchContext: string | null;

  // Strategy output
  strategy: string | null;

  // Generation output
  generatedContent: string;

  // Final output
  formattedOutput: string;

  // Timing
  startTime: number;
  researchTimeMs: number;
  strategyTimeMs: number;
  generationTimeMs: number;
  error: string | null;
}

export interface AntragAgentOutput {
  success: boolean;
  content: string;
  metadata: {
    strategy: string | null;
    requestType: AntragRequestType;
    researchTimeMs: number;
    strategyTimeMs: number;
    generationTimeMs: number;
    totalTimeMs: number;
    enrichmentMetadata?: EnrichmentMetadata;
    argumentsFound: number;
  };
  error?: string;
}

export const REQUEST_TYPE_DISPLAY_NAMES: Record<AntragRequestType, string> = {
  antrag: 'Antrag',
  kleine_anfrage: 'Kleine Anfrage',
  grosse_anfrage: 'Große Anfrage',
};

export const LOCALE_CONTEXT: Record<
  string,
  {
    municipalBody: string;
    legalBasis: string;
    decisionFormula: string;
    inquiryReference: string;
  }
> = {
  'de-DE': {
    municipalBody: 'Stadtrat/Kreistag',
    legalBasis: 'Gemeindeordnung',
    decisionFormula: 'Die Verwaltung wird beauftragt, ...',
    inquiryReference: 'Unter Bezugnahme auf das Auskunftsrecht in der Gemeindeordnung',
  },
  'de-AT': {
    municipalBody: 'Gemeinderat/Landtag',
    legalBasis: 'Gemeindeordnung des jeweiligen Bundeslandes',
    decisionFormula: 'Der Gemeinderat möge beschließen, ...',
    inquiryReference: 'Gemäß dem Auskunftsrecht nach dem jeweiligen Landesgesetz',
  },
};
