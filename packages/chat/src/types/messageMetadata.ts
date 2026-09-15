import type { AdditionalSource } from '../components/message-parts/SearchResultsSection';
import type {
  ChatProgress,
  Citation,
  GeneratedImage,
  SharepicData,
  ChartData,
  ComputeData,
  SearchResult,
  SearchImage,
  StreamMetadata,
} from '../hooks/useChatGraphStream';
import type { Citation as RawCitation, Source, LinkConfig } from '../runtime/NotebookModelAdapter';
import type { CodeArtifact } from '../stores/artifactLiveStore';
import type {
  ConfirmActionType,
  DocumentCreatedEvent,
  SocialPostPayload,
  BahnPayload,
} from '@gruenerator/contracts';

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
  /**
   * Image hits from the web search, rendered as named links by
   * `SearchImagesSection`. Separate from `searchResults` because an image carries
   * no text: as a search result it would become a numbered source with an empty
   * snippet.
   */
  searchImages?: SearchImage[];
  generatedImage?: GeneratedImage;
  sharepicData?: SharepicData;
  /** Text half of the EXPERIMENTAL combined social post (SocialPostCard). */
  socialPostData?: SocialPostPayload;
  chartData?: ChartData;
  artifactData?: CodeArtifact;
  computeData?: ComputeData;
  bahnData?: BahnPayload;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  confirmAction?: ConfirmActionData;
  createdDocument?: DocumentCreatedData;
  reelProcessing?: ReelProcessingData;
  reelPicker?: ReelPickerData;
  /** Turn was interrupted mid-stream (row still status='streaming' on reload);
   *  the partial text renders normally plus a subtle marker. */
  interrupted?: boolean;
  /**
   * Das Notebook hat zur Frage wenig Passendes gefunden (`evidence_weak`).
   * Trägt den SERVER-Text, keinen booleschen Schalter: der Satz lebt in
   * `CHAT_WARNINGS.evidence_weak.message` und soll genau eine Quelle behalten.
   *
   * Bewusst NICHT in PASSTHROUGH_METADATA_FIELDS — der Hinweis ist
   * zugscheibenlokal, siehe threadMessageConversion.ts.
   */
  evidenceWeak?: string;
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
