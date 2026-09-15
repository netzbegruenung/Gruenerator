import type {
  GeneratedImage,
  ChatProgress,
  Citation,
  SearchResult,
  SearchImage,
  StreamMetadata,
  SharepicData,
  ChartData,
  ComputeData,
} from '../../hooks/useChatGraphStream';
import type { CodeArtifact } from '../../stores/artifactLiveStore';
import type { ToolKey, ThreadMode, SearchMode } from '../../stores/chatStore';
import type {
  ConfirmActionData,
  DocumentCreatedData,
  ReelPickerData,
  ReelProcessingData,
} from '../../types/messageMetadata';
import type { ChatModelRunResult, ToolCallMessagePart } from '@assistant-ui/react';
import type { RoleRef, BahnPayload, NotebookDepth } from '@gruenerator/contracts';

export type GrueneratorMessageMetadata = {
  progress?: ChatProgress;
  searchResults?: SearchResult[];
  /**
   * Image hits from the web search, rendered as named links. Its own field rather
   * than entries in `searchResults`, because an image carries no text: as a search
   * result it would become a numbered source with an empty snippet.
   */
  searchImages?: SearchImage[];
  citations?: Citation[];
  generatedImage?: GeneratedImage;
  sharepicData?: SharepicData;
  chartData?: ChartData;
  artifactData?: CodeArtifact;
  computeData?: ComputeData;
  bahnData?: BahnPayload;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  agentId?: string;
  agentMention?: string;
  confirmAction?: ConfirmActionData;
  createdDocument?: DocumentCreatedData;
  reelProcessing?: ReelProcessingData;
  reelPicker?: ReelPickerData;
  /** Notebook found little relevant to answer with (`evidence_weak`); rendered
   *  as a quiet note under the answer instead of a toast (AssistantMessage.tsx). */
  evidenceWeak?: string;
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
  /**
   * Keyword facets to scope notebook retrieval by, keyed by filter field (the
   * shape `/research/filters` returns and `/notebook/stream` accepts). Web's
   * notebook page passes the same map through `NotebookAdapterConfig.filters`.
   */
  notebookFilters?: Record<string, string[]>;
  /** Notebook retrieval depth; defaults to `DEFAULT_NOTEBOOK_DEPTH`. */
  notebookMode?: NotebookDepth;
  threadMode?: ThreadMode;
  searchMode?: SearchMode;
  customSystemPrompt?: string | null;
  customRoleName?: string | null;
  /** Verweis auf die gewählte Rolle; der Prompttext bleibt server-seitig. */
  customRoleRef?: RoleRef | null;
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
  /** The turn ended on a clarification the user has to answer, so the adapter
   *  will now refuse every further run on this thread until the answer arrives.
   *  Fired from the same statement that arms that refusal, which is why it is
   *  the signal a message queue can trust: anything it sends next would be
   *  appended to the thread and then aborted. Independent of
   *  `unstable_humanToolNames` — the runtime only parks a message at
   *  `requires-action` for surfaces that declare the tool, the adapter refuses
   *  either way. */
  onInterrupt?: () => void;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, string | number | boolean | null>;
  result?: unknown;
  /** MCP-Apps widget metadata (system MCP tools only). When present with a
   *  `ui://` resourceUri, assistant-ui's `mcpApp` renderer mounts the widget
   *  iframe instead of the normal tool card (see GrueneratorChatRuntime). */
  mcp?: { app?: { resourceUri: string; mimeType?: string } };
  /** Run grouping for the collapsed tool summary row: the `toolCallId` of the
   *  first card in a contiguous card run (cards separated by text segments
   *  form separate runs). Consumed by assistant-ui's PartsGrouped rendering;
   *  absent on messages predating the interleaving rollout. */
  parentId?: string;
  /** Planner announcement sentence(s) that preceded this tool call (split-gather
   *  mode). Rendered as muted text above the card and persisted with the turn;
   *  the durable form of the live `gather_narration` status line. */
  narration?: string;
  /** Freigabe-Gate von assistant-ui: solange `approved` undefiniert und keine
   *  `resolution` gesetzt ist, hält die Laufzeit den Zug an und die Karte zeigt
   *  ihre Knöpfe. */
  approval?: ToolCallMessagePart['approval'];
  /** Anzeigename des Werkzeugs und Name des verbundenen Dienstes — nur an
   *  Freigabe-Karten gesetzt. Wer freigibt, muss lesen können, wohin der Aufruf
   *  geht; der Katalogname `m<key>__<tool>` sagt das nicht. Reisen wie
   *  `narration` auf `message.parts` mit (siehe ToolNarration). */
  title?: string;
  serverName?: string;
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
  /** Whether the backend's terminal event (`done`/`completion`) arrived. False
   *  means the stream just closed — the rendered answer is incomplete even
   *  though it looks finished, so the adapter marks the turn failed. */
  completed?: boolean;
  /** A client_tool interrupt the ModelAdapter must auto-execute (clientTools
   *  registry) and resume with — set instead of `interrupted`, which is
   *  reserved for manual human-in-the-loop interrupts (ask_human). threadId is
   *  carried from the interrupt event because brand-new threads have no
   *  config.threadId yet. */
  clientToolInterrupt?: { toolName: string; args: Record<string, unknown>; threadId?: string };
  /** Werkzeug-Freigabe: der Zug pausiert, bis die Person entschieden hat. Die
   *  Karten stehen als `approval` an den Tool-Parts; hier steht nur, zu welcher
   *  Pause die Antwort gehört. */
  toolApprovalPending?: { approvalTurnId: string };
}
