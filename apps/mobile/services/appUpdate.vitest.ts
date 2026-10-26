import { describe, it, expect } from 'vitest';

import {
  appIdentityHeaders,
  describeAppUpdate,
  type AppIdentityInput,
  type AppUpdateInput,
} from './appUpdate';

const base: AppUpdateInput = {
  appVersion: '1.2.1',
  isEnabled: true,
  isEmbeddedLaunch: true,
  createdAt: null,
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  hasError: false,
};

const row = (patch: Partial<AppUpdateInput> = {}) => describeAppUpdate({ ...base, ...patch });

describe('describeAppUpdate', () => {
  it('shows the plain store version on an embedded launch', () => {
    expect(row()).toEqual({ status: 'idle', value: '1.2.1', action: 'check' });
  });

  it('appends the bundle date once an update is running', () => {
    expect(row({ isEmbeddedLaunch: false, createdAt: new Date('2026-07-27T10:00:00Z') })).toEqual({
      status: 'idle',
      value: '1.2.1 · Stand 27.07.2026',
      action: 'check',
    });
  });

  it('falls back to the bare version when the bundle date is unknown', () => {
    expect(row({ isEmbeddedLaunch: false, createdAt: null }).value).toBe('1.2.1');
  });

  it('offers nothing in a development build', () => {
    // Everything below would be actionable if the flag were on — the point is
    // that `isEnabled` short-circuits before any of it, because the underlying
    // calls reject outside a release build.
    expect(row({ isEnabled: false, isUpdateAvailable: true, hasError: true })).toEqual({
      status: 'disabled',
      value: '1.2.1',
      action: 'none',
    });
  });

  describe('precedence', () => {
    it('puts the restart above every other in-flight state', () => {
      expect(row({ isRestarting: true, isDownloading: true, isChecking: true }).status).toBe(
        'restarting'
      );
    });

    it('reports the download, not the check, while both flags are set', () => {
      expect(row({ isDownloading: true, isChecking: true }).status).toBe('downloading');
    });

    it('offers the restart, not a second download, once the update landed', () => {
      // EAS sets both flags after a successful fetch.
      expect(row({ isUpdatePending: true, isUpdateAvailable: true })).toEqual({
        status: 'pending',
        value: 'Update bereit — zum Neustart tippen',
        action: 'reload',
      });
    });

    it('hides a stale error behind a ready update', () => {
      expect(row({ isUpdatePending: true, hasError: true }).status).toBe('pending');
    });

    it('hides a stale error behind an available update', () => {
      expect(row({ isUpdateAvailable: true, hasError: true }).status).toBe('available');
    });

    it('does not offer an action while a check is running', () => {
      expect(row({ isChecking: true }).action).toBe('none');
    });
  });

  describe('actions', () => {
    it('lets a failed check be retried', () => {
      expect(row({ hasError: true })).toEqual({
        status: 'error',
        value: 'Suche fehlgeschlagen — erneut versuchen',
        action: 'check',
      });
    });

    it('offers the download when an update was found but not fetched', () => {
      expect(row({ isUpdateAvailable: true })).toEqual({
        status: 'available',
        value: 'Update verfügbar',
        action: 'download',
      });
    });
  });
});

describe('appIdentityHeaders', () => {
  const identity: AppIdentityInput = {
    platform: 'ios',
    appVersion: '1.6.0',
    isEnabled: true,
    isEmbeddedLaunch: false,
    updateId: '0f3b1c2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c',
    createdAt: new Date('2026-10-20T08:00:00Z'),
  };

  it('names the running update and its build day', () => {
    expect(appIdentityHeaders(identity)).toEqual({
      'X-App-Platform': 'ios',
      'X-App-Version': '1.6.0',
      'X-App-Update': '0f3b1c2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c',
      'X-App-Update-Date': '2026-10-20',
    });
  });

  it('reports the store bundle as embedded', () => {
    expect(appIdentityHeaders({ ...identity, isEmbeddedLaunch: true })).toEqual({
      'X-App-Platform': 'ios',
      'X-App-Version': '1.6.0',
      'X-App-Update': 'embedded',
    });
  });

  it('sends no update at all from a build that cannot receive one', () => {
    // A dev client would otherwise be counted as `embedded` and blur the numbers.
    expect(appIdentityHeaders({ ...identity, isEnabled: false })).toEqual({
      'X-App-Platform': 'ios',
      'X-App-Version': '1.6.0',
    });
  });
});
