import { describe, expect, it } from 'vitest';

import { buildCloudSourceActions, DETACH_SOURCE_ID, SYNC_SOURCE_ID } from './cloudSourcesMenu';

describe('buildCloudSourceActions', () => {
  it('offers nothing to members', () => {
    expect(buildCloudSourceActions(false, false)).toEqual([]);
  });

  it('offers sync and a destructive detach to admins', () => {
    const actions = buildCloudSourceActions(true, false);
    expect(actions.map((a) => a.id)).toEqual([SYNC_SOURCE_ID, DETACH_SOURCE_ID]);
    expect(actions[1]?.attributes?.destructive).toBe(true);
  });

  it('only offers detach while the project is archived', () => {
    expect(buildCloudSourceActions(true, true).map((a) => a.id)).toEqual([DETACH_SOURCE_ID]);
  });
});
