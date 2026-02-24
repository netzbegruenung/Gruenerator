import type { EnrichedState, EnrichmentMetadata } from '../../../utils/types/requestEnrichment.js';
import type { ArgumentResult } from '../PRAgent/generators/argumentsGenerator.js';

export interface SocialAgentInput {
  inhalt: string;
  platforms: string[];
  zitatgeber: string | null;
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

export interface SocialAgentState {
  // Input
  inhalt: string;
  platforms: string[];
  zitatgeber: string | null;
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
  platformContent: Record<string, string>;

  // Final output
  formattedOutput: string;

  // Timing
  startTime: number;
  researchTimeMs: number;
  strategyTimeMs: number;
  generationTimeMs: number;
  error: string | null;
}

export interface SocialAgentOutput {
  success: boolean;
  content: string;
  metadata: {
    strategy: string | null;
    platforms: string[];
    researchTimeMs: number;
    strategyTimeMs: number;
    generationTimeMs: number;
    totalTimeMs: number;
    enrichmentMetadata?: EnrichmentMetadata;
    argumentsFound: number;
  };
  error?: string;
}

export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter/X, Mastodon & Bluesky',
  linkedin: 'LinkedIn',
  pressemitteilung: 'Pressemitteilung',
  actionIdeas: 'Aktionsideen',
  reelScript: 'Skript für Reels & TikToks',
};
