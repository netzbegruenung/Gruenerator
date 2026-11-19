import {
  SITE_FLYER_FIELD,
  isAiConsentRequiredBody,
  siteGenerationEventSchema,
  sitesContract,
  type SiteGenerationEvent,
  type WebsiteContent,
} from '@gruenerator/contracts';
import {
  getApiLocale,
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
  const data = frame
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => (l.startsWith('data: ') ? l.slice(6) : l.slice(5)))
    .join('\n');
  if (!data) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = siteGenerationEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function interrupted(err: unknown): unknown {
  return isAbort(err) ? err : new SiteGenerationError(INTERRUPTED_MESSAGE, true);
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
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-User-Locale': getApiLocale() },
      body: buildBody(input, email),
      signal,
    });
  } catch (err) {
    throw interrupted(err);
  }

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
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        throw interrupted(err);
      }
      const { done, value } = chunk;
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n?/g, '\n');
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
