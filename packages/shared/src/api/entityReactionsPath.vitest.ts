import { REACTION_EMOJIS, reactionEmojiSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { setGlobalApiClient } from './client.js';
import { getContractsClient, resetContractsClient } from './contractsClient.js';

import type { AxiosInstance } from 'axios';

describe('entityReactions emoji path round trip', () => {
  beforeEach(() => {
    resetContractsClient();
  });

  it('keeps the exact emoji set, including the variation selector of the heart', () => {
    expect([...REACTION_EMOJIS]).toEqual(['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀']);
    expect(REACTION_EMOJIS[5]).toBe('❤️');
  });

  it.each([...REACTION_EMOJIS])(
    'request path for %s decodes (as Express does for req.params) to a valid emoji',
    async (emoji) => {
      let requestedUrl = '';
      setGlobalApiClient({
        request: (config: { url?: string }) => {
          requestedUrl = config.url ?? '';
          return Promise.resolve({ status: 200, data: { reactions: [] }, headers: {} });
        },
      } as unknown as AxiosInstance);

      await getContractsClient().entityReactions.addReaction({
        params: { entityType: 'group_share', entityId: 'abc123', emoji },
      });

      // ts-rest inserts the raw emoji (no percent-encoding); the shared client strips
      // the /api prefix (baseURL carries it). The transport (XHR/fetch/Node URL) then
      // percent-encodes the UTF-8 bytes, and Express decodes req.params on arrival.
      expect(requestedUrl).toBe(`/auth/reactions/group_share/abc123/${emoji}`);
      const onTheWire = new URL(requestedUrl, 'http://localhost').pathname;
      const wireEmoji = onTheWire.split('/').pop() ?? '';
      expect(wireEmoji).toMatch(/^(%[0-9A-F]{2})+$/);
      expect(reactionEmojiSchema.parse(decodeURIComponent(wireEmoji))).toBe(emoji);
    }
  );
});
