/**
 * The device's list of creating tools (`CREATING_TOOLS` in packages/voice)
 * against the artifact kinds the call actually mounts. The API does not depend
 * on @gruenerator/voice, so the list is read as source text. A kind missing
 * there keeps the call's big blob over the chat while that card arrives.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARTIFACT_KINDS } from '../../../routes/chat/services/artifactKindRegistry.js';

const TYPES = resolve(import.meta.dirname, '../../../../../packages/voice/src/mistral/types.ts');

function deviceCreatingTools(): string[] {
  const source = readFileSync(TYPES, 'utf8');
  const block = /CREATING_TOOLS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source);
  if (!block) throw new Error('CREATING_TOOLS not found in packages/voice');
  return [...block[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('CREATING_TOOLS', () => {
  it('names exactly the artifact kinds a call can create', () => {
    expect(deviceCreatingTools().sort()).toEqual(ARTIFACT_KINDS.map((k) => k.loopToolName).sort());
  });
});
