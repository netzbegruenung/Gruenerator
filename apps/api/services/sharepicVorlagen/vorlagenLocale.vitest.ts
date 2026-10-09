import { beforeEach, describe, expect, it, vi } from 'vitest';

const isInstanceAdmin = vi.hoisted(() => vi.fn());
vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin }));

const { resolveVorlagenLocale } = await import('./vorlagenLocale.js');

const de = { user: { id: 'u1', email: 'a@example.org', locale: 'de-DE' }, headers: {} };

beforeEach(() => isInstanceAdmin.mockReset());

describe('resolveVorlagenLocale', () => {
  it('is the viewer country without `land`, and asks nobody', async () => {
    expect(await resolveVorlagenLocale(de, undefined)).toBe('de-DE');
    expect(isInstanceAdmin).not.toHaveBeenCalled();
  });

  it('is the viewer country when `land` names it anyway', async () => {
    expect(await resolveVorlagenLocale(de, 'de-DE')).toBe('de-DE');
    expect(isInstanceAdmin).not.toHaveBeenCalled();
  });

  it('switches for an instance admin', async () => {
    isInstanceAdmin.mockResolvedValue(true);
    expect(await resolveVorlagenLocale(de, 'de-AT')).toBe('de-AT');
    expect(isInstanceAdmin).toHaveBeenCalledWith('u1', 'a@example.org');
  });

  it('ignores `land` silently for everyone else', async () => {
    isInstanceAdmin.mockResolvedValue(false);
    expect(await resolveVorlagenLocale(de, 'de-AT')).toBe('de-DE');
    const at = { user: { id: 'u2', locale: 'de-AT' }, headers: {} };
    expect(await resolveVorlagenLocale(at, 'de-DE')).toBe('de-AT');
  });

  it('ignores `land` without a session', async () => {
    expect(await resolveVorlagenLocale({ headers: {} }, 'de-AT')).toBe('de-DE');
    expect(isInstanceAdmin).not.toHaveBeenCalled();
  });
});
