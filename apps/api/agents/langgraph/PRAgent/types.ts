export interface PRAgentRequest {
  inhalt: string;
  platforms: string[];
  zitatgeber?: string | undefined;
  was?: string | undefined;
  wie?: string | undefined;
  presseabbinder?: string | undefined;
  customPrompt?: string | undefined;
  selectedDocumentIds?: string[] | undefined;
  selectedTextIds?: string[] | undefined;
  searchQuery?: string | undefined;
  attachments?: unknown[] | undefined;
  useWebSearchTool?: boolean | undefined;
  [key: string]: unknown;
}

export interface SocialPlatformConfig {
  maxLength: number;
  style: string;
  focus: string;
  additionalGuidelines: string;
  top_p?: number | undefined;
}

export interface PRAgentResult {
  framing: string;
  pressRelease: string;
  social: {
    instagram: string;
    facebook: string;
  };
  riskAnalysis: string;
  visualBriefing: string;
}

export interface FormattedPRResponse {
  success: boolean;
  content: string;
  metadata: Record<string, unknown>;
  selectedPlatforms: string[];
  [key: string]: unknown;
}

export interface ContentExample {
  platform: string;
  content: string;
  relevanceScore?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}
