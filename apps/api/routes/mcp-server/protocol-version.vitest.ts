import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';

/**
 * Upstream canary for MCP spec revision 2026-07-28.
 *
 * That revision's major changes (removal of `initialize`, `server/discover`,
 * `subscriptions/listen`, MRTR, `resultType`, `CacheableResult`) all live in the
 * transport layer the SDK owns, so none of them are adoptable while the SDK
 * still tops out at 2025-11-25. Rather than track that by hand, this test fails
 * the moment a dependency bump raises it — i.e. exactly when "can we adopt
 * 2026-07-28 yet?" becomes answerable.
 *
 * When this goes red: don't just update the string. Re-read the readiness table
 * in CLAUDE-mcp.md and work through what the new SDK actually unblocks.
 */
describe('MCP SDK protocol version', () => {
  it('still tops out at 2025-11-25 (see CLAUDE-mcp.md → Spec revision 2026-07-28)', () => {
    expect(LATEST_PROTOCOL_VERSION).toBe('2025-11-25');
  });
});
