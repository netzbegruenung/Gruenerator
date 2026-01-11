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
  attachments?: any[];
  useWebSearchTool?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
  useUltraMode?: boolean;
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
  sharepics: any[];
  riskAnalysis: string;
  visualBriefing: string;
}

export interface FormattedPRResponse {
  success: boolean;
  content: string;
  sharepic: any[];
  metadata: Record<string, any>;
  selectedPlatforms: string[];
  onEditSharepic: () => Promise<void>;
}

export interface ContentExample {
  platform: string;
  content: string;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}
