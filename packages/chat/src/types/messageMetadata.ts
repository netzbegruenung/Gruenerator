import type {
  ChatProgress,
  Citation,
  GeneratedImage,
  SearchResult,
  StreamMetadata,
} from '../hooks/useChatGraphStream';
import type { Citation as RawCitation, Source, LinkConfig } from '../runtime/NotebookModelAdapter';
import type { AdditionalSource } from '../components/message-parts/SearchResultsSection';

export type ConfirmActionType = 'save_as_doc' | 'modify_doc' | 'modify_board';

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
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  // Confirm action (save_as_doc, modify_doc, modify_board)
  confirmAction?: ConfirmActionData;
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
