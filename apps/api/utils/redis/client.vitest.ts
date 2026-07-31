import { describe, expect, it, vi } from 'vitest';

/**
 * Guards the fix for `EnvironmentTeardownError: Closing rpc while
 * "onUserConsoleLog" was pending`.
 *
 * CI starts no Redis service, so this module-level client reconnects forever
 * and every attempt used to write to the console — long after the test file
 * that pulled it in had finished. Vitest forwards each line to its main process
 * over RPC, and one still in flight when a worker was torn down aborted the
 * entire run while reporting every test as passed.
 *
 * The reconnect path is the part that matters, so this points the client at a
 * dead port and waits for the retries rather than only checking import time.
 */
describe('redis client under test', () => {
  it('stays silent, including on reconnect attempts', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1'); // nothing listens here
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('./client.js');
    // Covers the first two backoff steps (500ms + 1000ms).
    await new Promise((resolve) => setTimeout(resolve, 1800));

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
