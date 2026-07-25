/**
 * The letterhead sender comes from the caller's own profile, never from the
 * request body — otherwise anyone could print any organisation onto Grünen
 * corporate-identity paper.
 *
 * The null cases matter as much as the happy path: a PDF download must not
 * become a 500 because a profile row is missing or the database hiccups.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileById = vi.fn();

vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById }),
}));

const { resolveLetterheadSender } = await import('./letterheadSender.js');

beforeEach(() => {
  getProfileById.mockReset();
});

describe('resolveLetterheadSender', () => {
  it('maps organisation, name and address', async () => {
    getProfileById.mockResolvedValue({
      first_name: 'Maxi',
      last_name: 'Mustermensch',
      display_name: 'Maxi',
      sender_organization: 'KV Musterstadt',
      sender_address: 'Musterweg 1\n12345 Musterstadt',
    });

    expect(await resolveLetterheadSender('user-1')).toEqual({
      name: 'Maxi Mustermensch',
      organization: 'KV Musterstadt',
      address: 'Musterweg 1\n12345 Musterstadt',
    });
  });

  it('prefers the full name over the informal display name', async () => {
    getProfileById.mockResolvedValue({
      first_name: 'Maxi',
      last_name: 'Mustermensch',
      display_name: 'Maxi',
    });

    expect((await resolveLetterheadSender('user-1'))?.name).toBe('Maxi Mustermensch');
  });

  it('falls back to the display name when no full name is set', async () => {
    getProfileById.mockResolvedValue({ display_name: 'Maxi' });

    expect((await resolveLetterheadSender('user-1'))?.name).toBe('Maxi');
  });

  it('omits empty fields instead of printing blank lines', async () => {
    getProfileById.mockResolvedValue({
      display_name: 'Maxi',
      sender_organization: '   ',
      sender_address: '',
    });

    expect(await resolveLetterheadSender('user-1')).toEqual({ name: 'Maxi' });
  });

  it('returns null when there is nothing worth printing', async () => {
    getProfileById.mockResolvedValue({ display_name: '', sender_organization: null });

    expect(await resolveLetterheadSender('user-1')).toBeNull();
  });

  it('returns null without a user — the contract tests run unauthenticated', async () => {
    expect(await resolveLetterheadSender(undefined)).toBeNull();
    expect(getProfileById).not.toHaveBeenCalled();
  });

  it('returns null when the profile is missing', async () => {
    getProfileById.mockResolvedValue(null);

    expect(await resolveLetterheadSender('user-1')).toBeNull();
  });

  it('never throws when the profile read fails', async () => {
    getProfileById.mockRejectedValue(new Error('postgres down'));

    await expect(resolveLetterheadSender('user-1')).resolves.toBeNull();
  });
});
