import type { ChatModelRunResult } from '@assistant-ui/react';
import type {
  GeneratedImage,
  ChatProgress,
  Citation,
  SearchResult,
  StreamMetadata,
} from '../../hooks/useChatGraphStream';
import type { ToolKey, ThreadMode, SearchMode } from '../../stores/chatStore';
import type {
  ConfirmActionData,
  DocumentCreatedData,
  ReelPickerData,
  ReelProcessingData,
} from '../../types/messageMetadata';

export type GrueneratorMessageMetadata = {
  progress?: ChatProgress;
  searchResults?: SearchResult[];
  citations?: Citation[];
  generatedImage?: GeneratedImage;
  sharepicData?: import('../../hooks/useChatGraphStream').SharepicData;
  chartData?: import('../../hooks/useChatGraphStream').ChartData;
  artifactData?: import('../../stores/artifactLiveStore').ActiveArtifact;
  computeData?: import('../../hooks/useChatGraphStream').ComputeData;
  bundestagData?: import('@gruenerator/contracts').BundestagPayload;
  bahnData?: import('@gruenerator/contracts').BahnPayload;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  agentId?: string;
  agentMention?: string;
  confirmAction?: ConfirmActionData;
  createdDocument?: DocumentCreatedData;
  reelProcessing?: ReelProcessingData;
  reelPicker?: ReelPickerData;
  [key: string]: unknown;
};

export interface GrueneratorAdapterConfig {
  agentId: string | null;
  modelId: string;
  enabledTools: Record<ToolKey, boolean>;
  threadId: string | null;
  selectedNotebookId?: string;
  /** Resolved `*-system` collection ids (or a user-notebook UUID) the notebook-mode
   *  request scopes retrieval to. Set by the host app, which owns the
   *  notebook→collection map; absent → fall back to `selectedNotebookId`. */
  selectedNotebookCollectionIds?: string[];
  /** Notebook RAG depth; defaults to 'fast' (still returns citations). */
  notebookMode?: 'fast' | 'deep';
  threadMode?: ThreadMode;
  searchMode?: SearchMode;
  customSystemPrompt?: string | null;
  customRoleName?: string | null;
  customEnabledTools?: Record<string, boolean> | null;
  /** Mention key of the active /skill (e.g. 'instagram'). Server appends the
   *  skill's `skillSystemPrompt` to the agent's systemRole when set. */
  activeSkillMention?: string | null;
  /** Pinned MCP connector — while set, the adapter injects its durable
   *  `@[Label](mcp:id)` token into every sent message and forces `mcp:<id>`,
   *  holding the tool scope across follow-ups. Web-only for now; null on other
   *  surfaces (e.g. the editor). */
  pinnedConnector?: { id: string; label: string } | null;
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
  /** A client_tool interrupt the ModelAdapter must auto-execute (clientTools
   *  registry) and resume with — set instead of `interrupted`, which is
   *  reserved for manual human-in-the-loop interrupts (ask_human). threadId is
   *  carried from the interrupt event because brand-new threads have no
   *  config.threadId yet. */
  clientToolInterrupt?: { toolName: string; args: Record<string, unknown>; threadId?: string };
}
