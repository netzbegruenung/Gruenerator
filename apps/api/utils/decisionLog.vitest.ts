/**
 * The production-safety properties of the decision-log sink.
 *
 * Two of these are the whole reason the feature is allowed to exist: it must
 * write nothing outside development, and a client-chosen filename must not be
 * able to escape the configured directory. Both are asserted here rather than
 * argued for in a comment.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type Request, type Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { recordDecision } from './decisionJournal.js';
import { decisionLogDir, decisionLogMiddleware, sanitizeLogId } from './decisionLog.js';

const dirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'decision-log-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Minimal req/res pair — the middleware touches five fields and `res.on`. */
function fakeExchange(
  logId: string | null,
  url = '/api/chat-graph/stream'
): {
  req: Request;
  res: Response;
  close: () => void;
} {
  const listeners: (() => void)[] = [];
  const req = {
    method: 'POST',
    originalUrl: url,
    headers: logId === null ? {} : { 'x-decision-log-id': logId },
  } as unknown as Request;
  const res = {
    on: (event: string, fn: () => void) => {
      if (event === 'close') listeners.push(fn);
    },
  } as unknown as Response;
  return { req, res, close: () => listeners.forEach((fn) => fn()) };
}

describe('sanitizeLogId', () => {
  it('collapses every path separator and traversal segment', () => {
    expect(sanitizeLogId('../../etc/passwd')).not.toContain('/');
    expect(sanitizeLogId('../../etc/passwd')).not.toContain('..');
    expect(sanitizeLogId('a/b\\c')).toBe('a_b_c');
  });

  it('keeps the ids the eval runner actually sends intact', () => {
    expect(sanitizeLogId('sharepic-licence-1.t0')).toBe('sharepic-licence-1.t0');
    expect(sanitizeLogId('sharepic-licence-1.t0.resume')).toBe('sharepic-licence-1.t0.resume');
  });

  it('never yields an empty name', () => {
    expect(sanitizeLogId('')).toBe('unnamed');
    expect(sanitizeLogId('...')).toBe('unnamed');
  });
});

describe('decisionLogDir', () => {
  it('is null in production even with the variable set', () => {
    expect(
      decisionLogDir({ NODE_ENV: 'production', CHAT_DECISION_LOG_DIR: '/tmp/never' })
    ).toBeNull();
  });

  it('is null under NODE_ENV=test — the value vitest itself runs with', () => {
    expect(decisionLogDir({ NODE_ENV: 'test', CHAT_DECISION_LOG_DIR: '/tmp/never' })).toBeNull();
  });

  it('is null in development without the variable', () => {
    expect(decisionLogDir({ NODE_ENV: 'development' })).toBeNull();
    expect(decisionLogDir({ NODE_ENV: 'development', CHAT_DECISION_LOG_DIR: '  ' })).toBeNull();
  });

  it('is the directory in development with the variable', () => {
    expect(decisionLogDir({ NODE_ENV: 'development', CHAT_DECISION_LOG_DIR: '/tmp/maps' })).toBe(
      '/tmp/maps'
    );
  });
});

describe('decisionLogMiddleware', () => {
  it('is not constructed at all outside development', () => {
    expect(
      decisionLogMiddleware({ NODE_ENV: 'production', CHAT_DECISION_LOG_DIR: scratch() })
    ).toBeNull();
  });

  it('binds a journal and writes it under the client-chosen id', async () => {
    const dir = scratch();
    const middleware = decisionLogMiddleware({
      NODE_ENV: 'development',
      CHAT_DECISION_LOG_DIR: dir,
    });
    if (!middleware) throw new Error('middleware should have been constructed');

    const { req, res, close } = fakeExchange('demo.t0', '/api/chat-graph/stream?x=1');
    await new Promise<void>((resolve) => {
      middleware(req, res, () => {
        // Inside the middleware's async-local scope — exactly where the router
        // and everything it calls runs in production.
        recordDecision('router.run_agentic', 'single_pass', { because: 'test' });
        resolve();
      });
    });
    close();

    const file = path.join(dir, 'demo.t0.json');
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      path: string;
      entries: { point: string; chose: string }[];
    };
    // Query string stripped — the id names the turn, not the URL.
    expect(parsed.path).toBe('/api/chat-graph/stream');
    expect(parsed.entries).toEqual([
      expect.objectContaining({ point: 'router.run_agentic', chose: 'single_pass' }),
    ]);
  });

  it('writes inside the configured directory even when the id tries to escape', async () => {
    const dir = scratch();
    const middleware = decisionLogMiddleware({
      NODE_ENV: 'development',
      CHAT_DECISION_LOG_DIR: dir,
    });
    if (!middleware) throw new Error('middleware should have been constructed');

    const { req, res, close } = fakeExchange('../../escaped');
    await new Promise<void>((resolve) => middleware(req, res, () => resolve()));
    close();

    expect(existsSync(path.join(dir, '..', '..', 'escaped.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'escaped.json'))).toBe(true);
  });

  it('writes once even though close can fire twice', async () => {
    const dir = scratch();
    const middleware = decisionLogMiddleware({
      NODE_ENV: 'development',
      CHAT_DECISION_LOG_DIR: dir,
    });
    if (!middleware) throw new Error('middleware should have been constructed');

    const { req, res, close } = fakeExchange('twice.t0');
    await new Promise<void>((resolve) => {
      middleware(req, res, () => {
        recordDecision('classifier.tier', 'tier3_heuristic');
        resolve();
      });
    });

    const file = path.join(dir, 'twice.t0.json');
    close();
    expect(existsSync(file)).toBe(true);

    // Delete, then fire close again. A latch that works leaves it deleted; one
    // that doesn't recreates the file — which is the observable difference
    // between writing once and writing on every close event.
    rmSync(file);
    close();
    expect(existsSync(file)).toBe(false);
  });
});
