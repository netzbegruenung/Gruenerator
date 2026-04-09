export interface PRAgentRequest {
  inhalt: string;
  platforms: string[];
  zitatgeber?: string;
  was?: string;
  wie?: string;
  presseabbinder?: string;
  customPrompt?: string;
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];
  searchQuery?: string;
  attachments?: unknown[];
  useWebSearchTool?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
  useUltraMode?: boolean;
  [key: string]: unknown;
}

export interface SocialPlatformConfig {
  maxLength: number;
  style: string;
  focus: string;
  additionalGuidelines: string;
  top_p?: number;
}

export interface PRAgentResult {
  framing: string;
  pressRelease: string;
  social: {
    instagram: string;
    facebook: string;
  };
  sharepics: Record<string, unknown>[];
  riskAnalysis: string;
  visualBriefing: string;
}

export interface FormattedPRResponse {
  success: boolean;
  content: string;
  sharepic: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  selectedPlatforms: string[];
  onEditSharepic: () => Promise<void>;
  [key: string]: unknown;
}

export interface ContentExample {
  platform: string;
  content: string;
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
}
