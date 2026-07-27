/**
 * The letterhead sender resolves from the caller's own data — a saved
 * letterhead, values typed in the export dialog, or their default.
 *
 * The invariant worth pinning: the NAME always comes from the profile, never
 * from the request. Organisation and address are the user's own text either
 * way, but the signature must not be forgeable.
 *
 * The null cases matter as much as the happy path: a PDF download must not
 * become a 500 because a row is missing or the database hiccups.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileById = vi.fn();
const getLetterhead = vi.fn();
const getDefaultLetterhead = vi.fn();

vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById }),
}));
vi.mock('../../services/user/letterheadRepository.js', () => ({
  getLetterhead,
  getDefaultLetterhead,
}));

const { resolveLetterheadSender } = await import('./letterheadSender.js');

const PROFILE = { first_name: 'Maxi', last_name: 'Mustermensch', display_name: 'Maxi' };

beforeEach(() => {
  getProfileById.mockReset().mockResolvedValue(PROFILE);
  getLetterhead.mockReset().mockResolvedValue(null);
  getDefaultLetterhead.mockReset().mockResolvedValue(null);
});

describe('resolveLetterheadSender', () => {
  it('uses the default letterhead when none is chosen', async () => {
    getDefaultLetterhead.mockResolvedValue({
      organization: 'KV Musterstadt',
      address: 'Musterweg 1\n12345 Musterstadt',
    });

    expect(await resolveLetterheadSender('user-1')).toEqual({
      name: 'Maxi Mustermensch',
      organization: 'KV Musterstadt',
      address: 'Musterweg 1\n12345 Musterstadt',
    });
  });

  it('uses the chosen letterhead over the default', async () => {
    getLetterhead.mockResolvedValue({ organization: 'Fraktion im Rat', address: null });
    getDefaultLetterhead.mockResolvedValue({ organization: 'KV Musterstadt', address: null });

    const sender = await resolveLetterheadSender('user-1', { letterheadId: 'lh-2' });

    expect(sender?.organization).toBe('Fraktion im Rat');
    expect(getLetterhead).toHaveBeenCalledWith('user-1', 'lh-2');
    expect(getDefaultLetterhead).not.toHaveBeenCalled();
  });

  it('prefers values typed in the dialog over anything saved', async () => {
    getDefaultLetterhead.mockResolvedValue({ organization: 'KV Musterstadt', address: null });

    const sender = await resolveLetterheadSender('user-1', {
      inline: { organization: 'Einmalig e.V.', address: 'Gasse 2\n1010 Wien' },
    });

    expect(sender?.organization).toBe('Einmalig e.V.');
    expect(getDefaultLetterhead).not.toHaveBeenCalled();
  });

  it('never takes the name from the request — only from the profile', async () => {
    const sender = await resolveLetterheadSender('user-1', {
      // A caller trying to sign as somebody else has no field to do it in;
      // this asserts the resulting name regardless.
      inline: { organization: 'Irgendwer' },
    });

    expect(sender?.name).toBe('Maxi Mustermensch');
  });

  it('falls back to the display name when no full name is set', async () => {
    getProfileById.mockResolvedValue({ display_name: 'Maxi' });
    getDefaultLetterhead.mockResolvedValue({ organization: 'KV', address: null });

    expect((await resolveLetterheadSender('user-1'))?.name).toBe('Maxi');
  });

  it('omits empty fields instead of printing blank lines', async () => {
    getDefaultLetterhead.mockResolvedValue({ organization: '   ', address: '' });

    expect(await resolveLetterheadSender('user-1')).toEqual({ name: 'Maxi Mustermensch' });
  });

  it('returns null when there is nothing worth printing', async () => {
    getProfileById.mockResolvedValue({ display_name: '' });

    expect(await resolveLetterheadSender('user-1')).toBeNull();
  });

  it('returns null without a user — the contract tests run unauthenticated', async () => {
    expect(await resolveLetterheadSender(undefined)).toBeNull();
    expect(getProfileById).not.toHaveBeenCalled();
  });

  it('returns null for a letterhead id that is not the caller’s', async () => {
    getProfileById.mockResolvedValue({ display_name: '' });
    getLetterhead.mockResolvedValue(null); // repository scopes by user_id

    expect(await resolveLetterheadSender('user-1', { letterheadId: 'someone-elses' })).toBeNull();
  });

  it('never throws when a read fails', async () => {
    getDefaultLetterhead.mockRejectedValue(new Error('postgres down'));

    await expect(resolveLetterheadSender('user-1')).resolves.toBeNull();
  });
});
