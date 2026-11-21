/**
 * Der Login des Grünerator-Kontos: eine Sitzung für mehrere Aufrufe, und nach
 * einem Fehlversuch eine Pause für alle Worker. Antragsgrün verlangt ab drei
 * Fehlversuchen je Benutzername in 60 Minuten ein Captcha (#5785).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  isReady: true,
}));

vi.mock('../../../utils/redis/client.js', () => ({
  redisClient: {
    get isReady() {
      return redis.isReady;
    },
    exists: async (key: string) => (redis.keys.has(key) ? 1 : 0),
    set: async (key: string, value: string) => {
      redis.keys.set(key, value);
      return 'OK';
    },
  },
}));

import { FormStepError, FormClient, type FetchLike } from '../../webForms/formClient.js';
import { login, loginRefusalText, resetBotSessionForTests, type HostingConfig } from './session.js';

const CONFIG: HostingConfig = {
  baseUrl: 'https://antragsgruen.de',
  botEmail: 'bot@gruenerator.eu',
  botPassword: 'geheim',
};

function fakeLogin(outcome: 'ok' | 'wrong' | 'captcha') {
  const posts: number[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    if ((init.method ?? 'GET') === 'GET') {
      return new Response('<form><input name="_csrf" value="c"></form>', { status: 200 });
    }
    posts.push(Date.now());
    if (outcome === 'ok') return new Response(null, { status: 302, headers: { location: '/' } });
    return new Response(
      outcome === 'captcha'
        ? '<div class="alert alert-danger">Bitte gib den angezeigten Code ein.</div><input name="captcha">'
        : '<div class="alert alert-danger">Falsches Passwort</div>',
      { status: 200 }
    );
  };
  return { client: new FormClient(fetchImpl), posts };
}

beforeEach(() => {
  resetBotSessionForTests();
  redis.keys.clear();
  redis.isReady = true;
});

describe('login', () => {
  it('logs in once and reuses the session for the next calls', async () => {
    const { client, posts } = fakeLogin('ok');
    await login(client, CONFIG);
    await login(client, CONFIG);
    await login(client, CONFIG);
    expect(posts).toHaveLength(1);
  });

  it('pauses after one wrong password: the next call does not reach Antragsgrün', async () => {
    const { client, posts } = fakeLogin('wrong');
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'login' });
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'login-paused' });
    expect(posts).toHaveLength(1);
  });

  it('pauses after a captcha as well', async () => {
    const { client, posts } = fakeLogin('captcha');
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'captcha' });
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'login-paused' });
    expect(posts).toHaveLength(1);
  });

  it('shares the pause through Redis with the other workers', async () => {
    await expect(login(fakeLogin('wrong').client, CONFIG)).rejects.toBeInstanceOf(FormStepError);
    // Ein anderer Worker: eigener Prozesszustand, dieselbe Redis.
    resetBotSessionForTests();
    const other = fakeLogin('ok');
    await expect(login(other.client, CONFIG)).rejects.toMatchObject({ step: 'login-paused' });
    expect(other.posts).toHaveLength(0);
  });

  it('keeps the pause in the process when Redis is down', async () => {
    redis.isReady = false;
    const { client, posts } = fakeLogin('wrong');
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'login' });
    await expect(login(client, CONFIG)).rejects.toMatchObject({ step: 'login-paused' });
    expect(posts).toHaveLength(1);
  });
});

describe('loginRefusalText', () => {
  it('names the captcha, and a paused or failed login, and nothing else', () => {
    expect(loginRefusalText(new FormStepError('x', 'captcha'))).toMatch(/Captcha/);
    expect(loginRefusalText(new FormStepError('x', 'login'))).toMatch(/nicht .* anmelden/);
    expect(loginRefusalText(new FormStepError('x', 'login-paused'))).toMatch(/nicht .* anmelden/);
    expect(loginRefusalText(new FormStepError('x', 'revoked'))).toBeNull();
    expect(loginRefusalText(new Error('x'))).toBeNull();
  });
});
