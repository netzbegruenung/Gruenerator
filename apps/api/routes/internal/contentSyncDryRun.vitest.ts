/**
 * Pins which sources may be asked for a dry run.
 *
 * The workflow's `dry_run` input reached eleven sources and was honoured by two;
 * the other nine stored for real under a report headed "Dry Run" (#2970). The
 * table is now the single answer to that question, and this test is what stops
 * a source being added to it on optimism: a `true` here has to point at real
 * code that skips the write.
 */
import { contentSyncSourceSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { dryRunCapableSources, supportsDryRun } from './contentSyncDryRun.js';

describe('dry-run capability', () => {
  it('lists exactly the two sources with a dry-run branch', () => {
    expect(dryRunCapableSources()).toEqual(['landesverbaende', 'abgeordnetenwatch']);
  });

  it('answers for every source in the contract enum', () => {
    // Record<ContentSyncSource, boolean> makes this a compile-time guarantee;
    // the runtime check is here so a widened key type cannot quietly undo it.
    for (const sourceId of contentSyncSourceSchema.options) {
      expect(typeof supportsDryRun(sourceId)).toBe('boolean');
    }
  });

  it('refuses the nine sources that would store for real', () => {
    const refused = contentSyncSourceSchema.options.filter((id) => !supportsDryRun(id));
    expect(refused).toHaveLength(9);
    expect(refused).toContain('gruene-de');
    expect(refused).toContain('grundsatz');
  });
});
