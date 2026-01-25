import { getGlobalApiClient } from '@gruenerator/shared/api';

export interface ChatSource {
  title: string;
  url: string;
  domain?: string;
}

export interface ChatAction {
  label: string;
  value: string;
}

export interface ChatAttachment {
  name: string;
  type: string;
  size?: number;
  data?: string;
}

export interface ChatContext {
  messageHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  lastAgent?: string;
}

export interface ChatRequest {
  message: string;
  context?: ChatContext;
  attachments?: ChatAttachment[];
  usePrivacyMode?: boolean;
  provider?: string | null;
}

export interface ChatResponseContent {
  text: string;
  type?: string;
}

/**
 * Metadata returned from chat API responses
 * Contains additional context about the response processing
 */
export interface ChatResponseMetadata {
  /** Whether pro mode was used for this response */
  useProMode?: boolean;
  /** Sub-intent detected from the user's message */
  subIntent?: string;
  /** Search query used for web search */
  searchQuery?: string;
  /** Number of results returned */
  resultCount?: number;
  /** Processing time in ms */
  processingTime?: number;
  /** Model used for generation */
  model?: string;
}

export interface ChatResponse {
  success: boolean;
  agent: string;
  subIntent?: string;
  content: ChatResponseContent;
  sources?: ChatSource[];
  requiresResponse?: boolean;
  metadata?: ChatResponseMetadata;
  multiResponse?: boolean;
  results?: ChatResponse[];
  error?: string;
  code?: string;
}

export type GrueneratorMessageType =
  | 'user'
  | 'assistant'
  | 'error'
  | 'action'
  | 'websearch_offer'
  | 'information_request';

export interface GrueneratorChatMessage {
  id: string;
  type: GrueneratorMessageType;
  content: string;
  timestamp: number;
  agent?: string;
  sources?: ChatSource[];
  actions?: ChatAction[];
  attachments?: ChatAttachment[];
  requiresResponse?: boolean;
}

const CHAT_ENDPOINT = '/api/chat';
const CLEAR_ENDPOINT = '/api/chat/clear';

export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const client = getGlobalApiClient();

  const response = await client.post<ChatResponse>(CHAT_ENDPOINT, request);

  if (!response?.data) {
    throw new Error('No response received from chat API');
  }

  return response.data;
}

export async function clearChatHistory(): Promise<{ success: boolean; message?: string }> {
  const client = getGlobalApiClient();

  const response = await client.delete<{ success: boolean; message?: string }>(CLEAR_ENDPOINT);

  return response?.data || { success: false };
}

export function normalizeResponse(response: ChatResponse): GrueneratorChatMessage {
  const baseMessage: GrueneratorChatMessage = {
    id: Date.now().toString(),
    type: 'assistant',
    content: '',
    timestamp: Date.now(),
    agent: response.agent,
  };

  if (!response.success) {
    return {
      ...baseMessage,
      type: 'error',
      content: response.error || 'Ein unbekannter Fehler ist aufgetreten.',
    };
  }

  switch (response.agent) {
    case 'conversation':
    case 'universal':
    case 'simple_response':
      return {
        ...baseMessage,
        content: response.content?.text || '',
      };

    case 'websearch':
      return {
        ...baseMessage,
        content: response.content?.text || '',
        sources: response.sources,
      };

    case 'websearch_offer':
      return {
        ...baseMessage,
        type: 'websearch_offer',
        content: response.content?.text || '',
        requiresResponse: true,
        actions: [
          { label: 'Ja, suchen', value: 'ja' },
          { label: 'Nein, danke', value: 'nein' },
        ],
      };

    case 'information_request':
      return {
        ...baseMessage,
        type: 'information_request',
        content: response.content?.text || '',
        requiresResponse: true,
      };

    case 'zitat':
    case 'zitat_pure':
    case 'zitat_with_image':
    case 'dreizeilen':
    case 'info':
    case 'headline':
    case 'sharepic':
      return {
        ...baseMessage,
        content: response.content?.text || 'Sharepic wurde erstellt!',
      };

    case 'imagine':
    case 'imagine_pure':
      return {
        ...baseMessage,
        content: response.content?.text || 'Bild wurde grüneriert!',
      };

    default:
      return {
        ...baseMessage,
        content: response.content?.text || 'Anfrage verarbeitet.',
      };
  }
}

export function createUserMessage(
  text: string,
  attachments?: ChatAttachment[]
): GrueneratorChatMessage {
  return {
    id: Date.now().toString(),
    type: 'user',
    content: text,
    timestamp: Date.now(),
    attachments,
  };
}

export function buildContextFromMessages(messages: GrueneratorChatMessage[]): ChatContext {
  const history = messages
    .filter((msg) => msg.type === 'user' || msg.type === 'assistant')
    .slice(-10)
    .map((msg) => ({
      role: (msg.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content,
    }));

  const lastAssistantMsg = [...messages].reverse().find((m) => m.type === 'assistant');

  return {
    messageHistory: history,
    lastAgent: lastAssistantMsg?.agent || undefined,
  };
}
