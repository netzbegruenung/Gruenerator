import { describe, expect, it } from 'vitest';

import { PUSH_NOTIFICATION_GROUPS, pushPriorityOf } from './notifications.js';
import { registerPushDeviceBodySchema } from './push.js';

const KEY = Buffer.alloc(32, 1).toString('base64');

describe('PUSH_NOTIFICATION_GROUPS', () => {
  it('lists every type in exactly one group', () => {
    const all = PUSH_NOTIFICATION_GROUPS.flatMap((g) => g.types);
    expect(new Set(all).size).toBe(all.length);
  });

  it('never pushes likes, member churn or announcements', () => {
    for (const type of [
      'notebook_liked',
      'group_member_joined',
      'new_avatars',
      'daily_briefing',
    ] as const) {
      expect(pushPriorityOf(type)).toBeNull();
    }
    expect(pushPriorityOf('group_user_mentioned')).toBe('high');
    expect(pushPriorityOf('group_post_created')).toBe('normal');
  });
});

describe('registerPushDeviceBodySchema', () => {
  const ok = { platform: 'ios', token: 't', key: KEY, apnsEnvironment: 'production' };

  it('accepts iOS with an APNs environment and Android without', () => {
    expect(registerPushDeviceBodySchema.safeParse(ok).success).toBe(true);
    expect(
      registerPushDeviceBodySchema.safeParse({ ...ok, platform: 'android', apnsEnvironment: null })
        .success
    ).toBe(true);
  });

  it('rejects a mismatched environment and keys that are not 32 bytes', () => {
    expect(registerPushDeviceBodySchema.safeParse({ ...ok, apnsEnvironment: null }).success).toBe(
      false
    );
    expect(registerPushDeviceBodySchema.safeParse({ ...ok, platform: 'android' }).success).toBe(
      false
    );
    const short = Buffer.alloc(16, 1).toString('base64');
    expect(registerPushDeviceBodySchema.safeParse({ ...ok, key: short }).success).toBe(false);
  });
});
