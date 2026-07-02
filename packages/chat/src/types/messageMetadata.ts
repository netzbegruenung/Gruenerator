import type {
  ConfirmActionType,
  DocumentCreatedEvent,
  SocialPostPayload,
} from '@gruenerator/contracts';
import type {
  ChatProgress,
  Citation,
  GeneratedImage,
  SharepicData,
  ChartData,
  ComputeData,
  SearchResult,
  StreamMetadata,
} from '../hooks/useChatGraphStream';
import type { ActiveArtifact } from '../stores/artifactLiveStore';
import type { Citation as RawCitation, Source, LinkConfig } from '../runtime/NotebookModelAdapter';
import type { AdditionalSource } from '../components/message-parts/SearchResultsSection';

// Wire enum lives in @gruenerator/contracts (chatStreamEvents); the
// confirm_action event's optionals are normalized to this required UI shape
// by parseSSEStream before it reaches a card.
export type { ConfirmActionType };

export interface ConfirmActionData {
  actionId: string;
  type: ConfirmActionType;
  title: string;
  description: string;
  icon: string;
  metadata: Array<{ key: string; value: string }>;
  confirmLabel: string;
  cancelLabel: string;
  threadId: string;
}

export type DocumentCreatedData = DocumentCreatedEvent;

/** A chat-uploaded video being auto-transcribed (ReelProcessingCard). */
export interface ReelProcessingData {
  uploadId: string;
  filename: string;
}

/** Reel project picker payload (ReelPickerCard). */
export interface ReelPickerData {
  projects: Array<{
    projectId: string;
    title: string;
    updatedAt: string;
    thumbnailUrl: string | null;
    hasSubtitles: boolean;
  }>;
}

export type ChatMessageMetadata = {
  progress?: ChatProgress;
  citations?: Citation[];
  additionalSources?: AdditionalSource[];
  // Skill/agent that generated this message
  agentId?: string;
  agentMention?: string;
  // Regular chat specific
  searchResults?: SearchResult[];
  generatedImage?: GeneratedImage;
  sharepicData?: SharepicData;
  /** Text half of the EXPERIMENTAL combined social post (SocialPostCard). */
  socialPostData?: SocialPostPayload;
  chartData?: ChartData;
  artifactData?: ActiveArtifact;
  computeData?: ComputeData;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  confirmAction?: ConfirmActionData;
  createdDocument?: DocumentCreatedData;
  reelProcessing?: ReelProcessingData;
  reelPicker?: ReelPickerData;
  // Notebook specific
  rawCitations?: RawCitation[];
  sources?: Source[];
  question?: string;
  resultId?: string;
  answerText?: string;
  linkConfig?: LinkConfig;
  sourcesByCollection?: Record<string, unknown>;
  [key: string]: unknown;
};
