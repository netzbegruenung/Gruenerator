import { EDITOR_EDIT_TOOL_KEYS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_KEYS } from './agentToolKeys.js';

/**
 * `AGENT_TOOL_KEYS` mirrors the contracts registry by hand (agents/ imports no
 * foreign packages). A surface key added to `editorEditToolKeySchema` without
 * a line here makes `build:agents` reject the editor agent that declares it.
 */
describe('AGENT_TOOL_KEYS', () => {
  it('contains every editor-surface edit key from the contracts registry', () => {
    const missing = EDITOR_EDIT_TOOL_KEYS.filter((key) => !AGENT_TOOL_KEYS.includes(key));
    expect(missing).toEqual([]);
  });
});
