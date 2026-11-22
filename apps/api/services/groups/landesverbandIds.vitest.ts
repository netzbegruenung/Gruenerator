import { landesverbandIdSchema } from '@gruenerator/contracts';
import { LANDESVERBAENDE } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

describe('landesverbandIdSchema', () => {
  it('matches the LANDESVERBAENDE registry (contracts cannot import shared)', () => {
    expect([...landesverbandIdSchema.options].sort()).toEqual(
      LANDESVERBAENDE.map((lv) => lv.id).sort()
    );
  });
});
