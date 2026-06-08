import type { ChatModelRunResult } from '@assistant-ui/react';
import type {
  GeneratedImage,
  ChatProgress,
  Citation,
  SearchResult,
  StreamMetadata,
} from '../../hooks/useChatGraphStream';
import type { ToolKey, ThreadMode, SearchMode } from '../../stores/chatStore';
import type { ConfirmActionData, DocumentCreatedData } from '../../types/messageMetadata';

export type GrueneratorMessageMetadata = {
  progress?: ChatProgress;
  searchResults?: SearchResult[];
  citations?: Citation[];
  generatedImage?: GeneratedImage;
  sharepicData?: import('../../hooks/useChatGraphStream').SharepicData;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  agentId?: string;
  agentMention?: string;
  confirmAction?: ConfirmActionData;
  createdDocument?: DocumentCreatedData;
  [key: string]: unknown;
};

export interface GrueneratorAdapterConfig {
  agentId: string | null;
  modelId: string;
  enabledTools: Record<ToolKey, boolean>;
  threadId: string | null;
  selectedNotebookId?: string;
  threadMode?: ThreadMode;
  searchMode?: SearchMode;
  customSystemPrompt?: string | null;
  customRoleName?: string | null;
  customEnabledTools?: Record<string, boolean> | null;
  /** Mention key of the active /skill (e.g. 'instagram'). Server appends the
   *  skill's `skillSystemPrompt` to the agent's systemRole when set. */
  activeSkillMention?: string | null;
}

export interface GrueneratorAdapterCallbacks {
  onThreadCreated?: (threadId: string) => void;
  onComplete?: (metadata: StreamMetadata) => void;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, string | number | boolean | null>;
  result?: unknown;
}

export interface SourcePart {
  type: 'source';
  sourceType: 'url';
  id: string;
  url: string;
  title?: string;
  parentId?: string;
}

export interface StreamOutcome {
  interrupted: boolean;
  lastResult?: ChatModelRunResult;
  indexedDocumentIds: string[];
}
