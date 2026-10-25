import { describe, expect, it, vi } from 'vitest';

const ctor = vi.fn();
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    constructor(options: unknown) {
      ctor(options);
    }
  },
}));

import { createQdrantClient, readQdrantTargets } from './connection.js';

const base = {
  QDRANT_URL: 'https://qdrant.example/qdrant/',
  QDRANT_API_KEY: 'instance-key',
  QDRANT_BASIC_AUTH_USERNAME: undefined,
  QDRANT_BASIC_AUTH_PASSWORD: undefined,
  QDRANT_CONTENT_URL: undefined,
  QDRANT_CONTENT_API_KEY: undefined,
  QDRANT_CONTENT_BASIC_AUTH_USERNAME: undefined,
  QDRANT_CONTENT_BASIC_AUTH_PASSWORD: undefined,
  QDRANT_CONTENT_READ_ONLY: false,
};

describe('readQdrantTargets', () => {
  it('without QDRANT_CONTENT_URL content is null and read-only is ignored', () => {
    const targets = readQdrantTargets({ ...base, QDRANT_CONTENT_READ_ONLY: true });
    expect(targets.content).toBeNull();
    expect(targets.contentReadOnly).toBe(false);
    expect(targets.instance).toEqual({
      url: 'https://qdrant.example/qdrant/',
      apiKey: 'instance-key',
      basicAuthUsername: null,
      basicAuthPassword: null,
    });
  });

  it('content target takes its own key and basic auth', () => {
    const targets = readQdrantTargets({
      ...base,
      QDRANT_BASIC_AUTH_USERNAME: 'inst-user',
      QDRANT_BASIC_AUTH_PASSWORD: 'inst-pass',
      QDRANT_CONTENT_URL: 'https://content.example',
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_BASIC_AUTH_USERNAME: 'c-user',
      QDRANT_CONTENT_BASIC_AUTH_PASSWORD: 'c-pass',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    expect(targets.content).toEqual({
      url: 'https://content.example',
      apiKey: 'content-key',
      basicAuthUsername: 'c-user',
      basicAuthPassword: 'c-pass',
    });
    expect(targets.instance.basicAuthUsername).toBe('inst-user');
    expect(targets.contentReadOnly).toBe(true);
  });

  it('content without its own key throws', () => {
    expect(() =>
      readQdrantTargets({ ...base, QDRANT_CONTENT_URL: 'https://content.example' })
    ).toThrow(/QDRANT_CONTENT_API_KEY/);
  });

  it('missing instance url or key throws', () => {
    expect(() => readQdrantTargets({ ...base, QDRANT_API_KEY: ' ' })).toThrow(
      'QDRANT_API_KEY environment variable is required but not set or empty'
    );
    expect(() => readQdrantTargets({ ...base, QDRANT_URL: undefined })).toThrow(
      'QDRANT_URL environment variable is required but not set'
    );
  });
});

describe('createQdrantClient', () => {
  it('https target uses host/port/prefix and basic auth header', () => {
    ctor.mockClear();
    createQdrantClient({
      url: 'https://qdrant.example/qdrant/',
      apiKey: 'k',
      basicAuthUsername: 'u',
      basicAuthPassword: 'p',
    });
    expect(ctor).toHaveBeenCalledWith({
      host: 'qdrant.example',
      port: 443,
      https: true,
      apiKey: 'k',
      timeout: 60000,
      checkCompatibility: false,
      headers: { Authorization: `Basic ${Buffer.from('u:p').toString('base64')}` },
      prefix: '/qdrant/',
    });
  });

  it('http target uses url and no headers without basic auth', () => {
    ctor.mockClear();
    createQdrantClient({
      url: 'http://localhost:6333',
      apiKey: 'k',
      basicAuthUsername: null,
      basicAuthPassword: null,
    });
    expect(ctor).toHaveBeenCalledWith({
      url: 'http://localhost:6333',
      apiKey: 'k',
      https: false,
      timeout: 60000,
    });
  });
});
