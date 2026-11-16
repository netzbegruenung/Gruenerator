import { describe, expect, it, vi } from 'vitest';

vi.mock('../user/ProfileService.js', () => ({ getProfileService: () => ({}) }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { getPresetPreferences, resolveChannelPreferences, deriveLevel, getDefaultPreferences } =
  await import('./notificationPreferences.js');

describe('group_chat_message defaults', () => {
  it('is in-app on and email off at the default level (one mail per turn would be spam)', () => {
    const d = getDefaultPreferences().group_chat_message;
    expect(d.in_app).toBe(true);
    expect(d.email).toBe(false);
    expect(resolveChannelPreferences(undefined, 'group_chat_message')).toMatchObject({
      in_app: true,
      email: false,
    });
  });

  it('is fully off at "Wenig" and still email-off at "Viele"', () => {
    expect(getPresetPreferences('low').group_chat_message).toMatchObject({
      in_app: false,
      email: false,
    });
    expect(getPresetPreferences('high').group_chat_message).toMatchObject({
      in_app: true,
      email: false,
    });
  });

  it('a user who enables email gets it', () => {
    expect(resolveChannelPreferences({ email: true }, 'group_chat_message').email).toBe(true);
  });

  it('the presets still derive their own level', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(deriveLevel(getPresetPreferences(level))).toBe(level);
    }
  });

  it('other tier-2 types keep email on at "Mittel"', () => {
    expect(getPresetPreferences('medium').group_post_created.email).toBe(true);
  });
});
