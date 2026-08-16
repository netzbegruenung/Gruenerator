import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express, { type Application, type RequestHandler } from 'express';

import { type UserProfile } from '../../../../services/user/types.js';
import { mountChatGraphContractRouter } from '../../chatGraphContractRouter.js';

import { userMiddleware } from './fakeUser.js';

/**
 * A bare express app carrying ONLY the chat-graph contract router — the shape
 * copied from `apps/api/routes/exports/exportsContract.vitest.ts`, which is the
 * repo's existing pattern for driving a ts-rest router over real HTTP.
 *
 * Production mounts `requireAuth` → `express.json({limit:'50mb'})` →
 * `aiGenerationLimiter` ahead of the router (routes.ts). We reproduce the body
 * parser (without it `args.body` never arrives), substitute the user middleware
 * (see fakeUser.ts), and deliberately omit the rate limiter: an in-memory
 * limiter shared across a file's tests would make test order significant.
 */
export interface ChatAppOptions {
  /** `null` mounts no user middleware at all — the `unauthorized` path. */
  user?: Partial<UserProfile> | null;
  /** Binds a per-request decision journal (see journalCapture.ts). */
  decisionJournal?: RequestHandler;
}

export interface ChatApp {
  baseUrl: string;
  app: Application;
  close: () => Promise<void>;
}

export async function startChatApp(options: ChatAppOptions = {}): Promise<ChatApp> {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  if (options.user !== null) {
    app.use(userMiddleware(options.user ?? {}));
  }
  if (options.decisionJournal) {
    app.use(options.decisionJournal);
  }

  mountChatGraphContractRouter(app);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    baseUrl,
    app,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

function post(
  baseUrl: string,
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export function postStream(
  baseUrl: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  return post(baseUrl, '/api/chat-graph/stream', body, headers);
}

export function postResume(
  baseUrl: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  return post(baseUrl, '/api/chat-graph/resume', body, headers);
}

/**
 * The Vercel UIMessage wire shape. The backend reads `parts`, not `content`
 * (see `apps/api/evals/runChatEval.ts`) — a `content`-only message does not
 * survive `convertToModelMessages`.
 */
export function userTurn(text: string, id = 'm1'): Record<string, unknown> {
  return { id, role: 'user', parts: [{ type: 'text', text }] };
}
