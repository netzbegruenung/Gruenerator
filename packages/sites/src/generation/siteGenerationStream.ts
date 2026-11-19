import {
  SITE_FLYER_FIELD,
  isAiConsentRequiredBody,
  siteGenerationEventSchema,
  sitesContract,
  type SiteGenerationEvent,
  type WebsiteContent,
} from '@gruenerator/contracts';
import {
  getGlobalApiClient,
  notifyAiConsentRequired,
  stripApiPrefix,
} from '@gruenerator/shared/api';

import { SitesApiError } from '../utils/errorHandler';

export type SiteGenerationInput = { description: string } | { file: File };

const INTERRUPTED_MESSAGE = 'Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.';
const FALLBACK_MESSAGE = 'Die Seite konnte nicht erstellt werden.';

export class SiteGenerationError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'SiteGenerationError';
    this.retryable = retryable;
  }
}

function buildBody(input: SiteGenerationInput, email: string): FormData {
  const form = new FormData();
  if ('file' in input) {
    form.append(SITE_FLYER_FIELD, input.file);
  } else {
    form.append('description', input.description);
  }
  if (email) form.append('email', email);
  return form;
}

function parseFrame(frame: string): SiteGenerationEvent | null {
  const line = frame.split('\n').find((l) => l.startsWith('data: '));
  if (!line) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line.slice(6));
  } catch {
    return null;
  }
  const parsed = siteGenerationEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function failureFromResponse(response: Response): Promise<SitesApiError> {
  const body = (await response.json().catch(() => null)) as unknown;
  if (response.status === 403 && isAiConsentRequiredBody(body)) notifyAiConsentRequired();
  const message = (body as { error?: unknown } | null)?.error;
  return new SitesApiError(
    response.status,
    typeof message === 'string' && message ? message : FALLBACK_MESSAGE
  );
}

export async function streamSiteGeneration(
  input: SiteGenerationInput,
  email: string,
  onEvent: (event: SiteGenerationEvent) => void,
  signal: AbortSignal
): Promise<WebsiteContent> {
  const url = `${getGlobalApiClient().defaults.baseURL ?? ''}${stripApiPrefix(
    sitesContract.generateSiteContent.path
  )}`;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: buildBody(input, email),
    signal,
  });

  if (!response.ok) throw await failureFromResponse(response);
  if (!response.body) throw new SiteGenerationError(INTERRUPTED_MESSAGE, true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (frame: string): WebsiteContent | null => {
    const event = parseFrame(frame);
    if (!event || event.type === 'heartbeat') return null;
    if (event.type === 'error') throw new SiteGenerationError(event.message, event.retryable);
    onEvent(event);
    return event.type === 'done' ? event.content : null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const content = handle(frame);
        if (content) return content;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const content = handle(buffer);
      if (content) return content;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  throw new SiteGenerationError(INTERRUPTED_MESSAGE, true);
}
