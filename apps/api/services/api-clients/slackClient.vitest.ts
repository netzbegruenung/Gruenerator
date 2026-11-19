/** Slack meldet Fehler als HTTP 200 mit `ok: false` — die müssen als Fehler ankommen. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
vi.mock('axios', () => ({ default: { get, post } }));

const { SlackApiError, listMemberChannels, postMarkdownMessage } = await import('./slackClient.js');

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('listMemberChannels', () => {
  it('follows the cursor and sorts by name', async () => {
    get
      .mockResolvedValueOnce({
        data: {
          ok: true,
          channels: [{ id: 'C2', name: 'presse' }],
          response_metadata: { next_cursor: 'abc' },
        },
      })
      .mockResolvedValueOnce({ data: { ok: true, channels: [{ id: 'C1', name: 'allgemein' }] } });

    expect((await listMemberChannels('xoxb')).map((c) => c.id)).toEqual(['C1', 'C2']);
    expect(get.mock.calls[1][1]).toMatchObject({ params: { cursor: 'abc' } });
  });

  it('turns a revoked token into an auth error', async () => {
    get.mockResolvedValue({ data: { ok: false, error: 'token_revoked' } });
    await expect(listMemberChannels('xoxb')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('postMarkdownMessage', () => {
  it('posts a markdown block and returns the permalink', async () => {
    post.mockResolvedValue({ data: { ok: true, channel: 'C1', ts: '1.2' } });
    get.mockResolvedValue({ data: { ok: true, permalink: 'https://x.slack.com/p12' } });

    expect(await postMarkdownMessage('xoxb', 'C1', '# Hi', 'Hi')).toEqual({
      permalink: 'https://x.slack.com/p12',
    });
    expect(post.mock.calls[0][1]).toMatchObject({
      channel: 'C1',
      text: 'Hi',
      blocks: [{ type: 'markdown', text: '# Hi' }],
    });
  });

  it('reports a channel the bot is not in as not found', async () => {
    post.mockResolvedValue({ data: { ok: false, error: 'not_in_channel' } });
    const error = await postMarkdownMessage('xoxb', 'C1', 'x', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlackApiError);
    expect(error).toMatchObject({ kind: 'not_found' });
  });
});
