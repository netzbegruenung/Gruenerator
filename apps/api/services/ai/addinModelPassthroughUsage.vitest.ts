import { describe, expect, it } from 'vitest';

import { runWithUsageContext, getUsageUserId, featureFromPath } from '../../utils/usageContext.js';

import { createUsageSniffer, parseUsage } from './addinModelPassthrough.js';

const enc = new TextEncoder();

describe('parseUsage', () => {
  it('reads tokens and the cached share', () => {
    expect(
      parseUsage({
        prompt_tokens: 10,
        completion_tokens: 4,
        prompt_tokens_details: { cached_tokens: 6 },
      })
    ).toEqual({ inputTokens: 10, outputTokens: 4, cachedInputTokens: 6 });
  });

  it('returns null, not zeros, when the upstream sent no usage', () => {
    expect(parseUsage(undefined)).toBeNull();
    expect(parseUsage({})).toBeNull();
  });
});

describe('createUsageSniffer', () => {
  it('finds the usage chunk even when a line straddles two reads', () => {
    const sniffer = createUsageSniffer();
    const final = 'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n';
    sniffer.push(enc.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
    sniffer.push(enc.encode(final.slice(0, 30)));
    sniffer.push(enc.encode(final.slice(30) + 'data: [DONE]\n\n'));
    expect(sniffer.usage()).toEqual({ inputTokens: 7, outputTokens: 3, cachedInputTokens: 0 });
  });

  it('reports null for a stream without usage', () => {
    const sniffer = createUsageSniffer();
    sniffer.push(enc.encode('data: {"choices":[]}\n\ndata: [DONE]\n\n'));
    expect(sniffer.usage()).toBeNull();
  });
});

describe('usage attribution on API-key routes', () => {
  it('falls back to the key owner when req.user is unset', () => {
    runWithUsageContext({ req: { apiKey: { userId: 'u1' } }, feature: 'chat' }, () => {
      expect(getUsageUserId()).toBe('u1');
    });
  });

  it('prefers the session user', () => {
    runWithUsageContext(
      { req: { user: { id: 'session' }, apiKey: { userId: 'key' } }, feature: 'chat' },
      () => expect(getUsageUserId()).toBe('session')
    );
  });

  it('books /api/v1/chat/completions as chat', () => {
    expect(featureFromPath('/api/v1/chat/completions')).toBe('chat');
  });
});
