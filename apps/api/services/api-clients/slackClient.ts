/**
 * Slack Web API mit dem Bot-Token aus Nango (Scopes `channels:read`,
 * `groups:read`, `chat:write`).
 *
 * Bewusst nur Kanäle, in denen der Bot Mitglied ist (`users.conversations`):
 * gepostet wird dorthin, wohin jemand im Workspace den Grünerator eingeladen
 * hat, nicht in jeden öffentlichen Kanal (`chat:write.public` fragen wir nicht an).
 *
 * Slack antwortet auch auf Fehler mit HTTP 200 und `{ ok: false, error }`.
 */
import axios from 'axios';
import { z } from 'zod';

const SLACK_API = 'https://slack.com/api';

/** Fehler, nach denen nur ein neues Verbinden hilft. */
const AUTH_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'missing_scope',
]);

const NOT_FOUND_ERRORS = new Set(['channel_not_found', 'not_in_channel', 'is_archived']);

export class SlackApiError extends Error {
  constructor(
    readonly code: string,
    readonly kind: 'auth' | 'not_found' | 'other'
  ) {
    super(`Slack API error: ${code}`);
    this.name = 'SlackApiError';
  }
}

const slackErrorSchema = z.object({ ok: z.literal(false), error: z.string() });

async function call<T>(
  token: string,
  method: string,
  schema: z.ZodType<T>,
  request: { params?: Record<string, string | number>; body?: unknown }
): Promise<T> {
  const response = request.body
    ? await axios.post(`${SLACK_API}/${method}`, request.body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
    : await axios.get(`${SLACK_API}/${method}`, {
        headers: { Authorization: `Bearer ${token}` },
        ...(request.params ? { params: request.params } : {}),
      });
  const failure = slackErrorSchema.safeParse(response.data);
  if (failure.success) {
    const code = failure.data.error;
    throw new SlackApiError(
      code,
      AUTH_ERRORS.has(code) ? 'auth' : NOT_FOUND_ERRORS.has(code) ? 'not_found' : 'other'
    );
  }
  return schema.parse(response.data);
}

const slackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_private: z.boolean().optional(),
});
export type SlackChannel = z.infer<typeof slackChannelSchema>;

const conversationsResponseSchema = z.object({
  ok: z.literal(true),
  channels: z.array(slackChannelSchema),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional(),
});

const MAX_CHANNELS = 1000;

export async function listMemberChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const page = await call(token, 'users.conversations', conversationsResponseSchema, {
      params: {
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      },
    });
    channels.push(...page.channels);
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor && channels.length < MAX_CHANNELS);
  return channels.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Slack rendert einen `markdown`-Block; zusammen höchstens 12 000 Zeichen. */
export const SLACK_MARKDOWN_MAX = 12_000;

const postMessageResponseSchema = z.object({
  ok: z.literal(true),
  channel: z.string(),
  ts: z.string(),
});
const permalinkResponseSchema = z.object({ ok: z.literal(true), permalink: z.string().url() });

export async function postMarkdownMessage(
  token: string,
  channelId: string,
  markdown: string,
  fallbackText: string
): Promise<{ permalink: string }> {
  const posted = await call(token, 'chat.postMessage', postMessageResponseSchema, {
    body: {
      channel: channelId,
      // Notifications and clients without block support show `text`.
      text: fallbackText,
      blocks: [{ type: 'markdown', text: markdown }],
      unfurl_links: false,
    },
  });
  const link = await call(token, 'chat.getPermalink', permalinkResponseSchema, {
    params: { channel: posted.channel, message_ts: posted.ts },
  });
  return { permalink: link.permalink };
}
